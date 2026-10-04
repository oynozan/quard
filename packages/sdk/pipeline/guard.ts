import { canonicalJson, labelFor, newStepId } from "@quard/shared";
import { getConfig } from "../core/config.ts";
import { GuardBlockedError, GuardRefusal } from "../core/refusal.ts";
import { claimCall, registerGuardedTool, type RequestedCall } from "../context/registry.ts";
import { currentScope, mayUse, newScope, withScope, type Scope } from "../context/scope.ts";
import type { FailResult, GuardCall, RuleResult } from "../guards/call.ts";
import { maskArgs } from "../guards/egress/payload.ts";
import type { ApprovalOptions, GuardOptions } from "../guards/options.ts";
import { isGuardType } from "../guards/types.ts";
import { labelArguments } from "../labels/value-labels.ts";
import { policyOptions, refreshSources, sourcesReady } from "../policy/state.ts";
import { syncRules } from "../transport/link/active.ts";
import { callAborted } from "./abort.ts";
import { askHuman } from "./approval/human.ts";
import { blocked } from "./approval/record.ts";
import { asksOf, decide, preChecks, recordDecision } from "./checks.ts";
import { countCall } from "./count/count.ts";
import { reportRefused } from "./count/fleet.ts";
import { finishOutput, recordToolCall, runTool } from "./output.ts";
import { snapshot } from "./snapshot.ts";

type Spec = {
    fn: (...args: never[]) => unknown;
    list: GuardOptions[];
    tool: string;
};

// One argument is checked as itself, several as a list
function inputOf(args: unknown[]): unknown {
    return args.length === 1 ? args[0] : args;
}

function buildCall(tool: string, input: unknown, scope: Scope, stepId: string): GuardCall {
    return {
        tool,
        input,
        agent: scope.agent,
        runId: scope.run.runId,
        stepId,
        context: scope.run.index.context(),
        values: labelArguments(input, scope.run.index),
        run: scope.run,
        depth: scope.depth,
    };
}

function permission(scope: Scope, tool: string, requested: RequestedCall | undefined): RuleResult {
    const base = { guard: "permission", rule: "permission", mode: "block" } as const;
    if (requested?.blocked !== undefined) {
        return { ...base, decision: "block", reason: requested.blocked.reason };
    }
    return mayUse(scope, tool)
        ? { ...base, decision: "allow" }
        : { ...base, decision: "block", reason: "permission_denied" };
}

// Arguments that are not plain data are not copied, so the caller could
// change them after the approver saw them
function changed(call: GuardCall, approvedArgs: string | undefined): FailResult | undefined {
    if (approvedArgs === undefined || canonicalJson(call.input) === approvedArgs) {
        return undefined;
    }
    return blocked(call, "arguments-changed", "approval_required");
}

// Records the block and returns a refusal, or throws when the guard that
// caused the block sets onBlock: "throw"
function refuse(
    spec: Spec,
    call: GuardCall,
    requested: RequestedCall | undefined,
    result: FailResult,
    ran = false,
): GuardRefusal {
    recordToolCall(call, requested, "blocked", Date.now());
    if (!ran) {
        reportRefused(call, spec.list);
    }
    if (requested !== undefined) {
        // The refusal text the app sends back is ours, not outside content
        requested.outputLabel = labelFor("system", getConfig().origins);
    }
    const refused = new GuardRefusal({
        guard: result.guard,
        tool: spec.tool,
        reason: result.reason,
        field: result.field,
    });
    const onBlock =
        spec.list.find((item) => item.type === result.guard)?.onBlock ??
        spec.list.find((item) => item.onBlock !== undefined)?.onBlock;
    if (onBlock === "throw") {
        throw new GuardBlockedError(refused);
    }
    return refused;
}

async function runPipeline(code: Spec, args: unknown[], signal: AbortSignal | undefined): Promise<unknown> {
    // A call its caller already gave up on is not checked at all
    signal?.throwIfAborted();
    // One copy of the arguments is used for checks, approval and the run
    let runArgs = snapshot(args);
    let input = inputOf(runArgs);

    // 0. A changed policy file or feed applies from this call on
    refreshSources(Date.now());
    await sourcesReady();
    syncRules();
    const spec: Spec = { ...code, list: policyOptions(code.tool) ?? code.list };

    // 1. Context: the current scope, or the run of the call the model asked for
    const current = currentScope();
    const requested = claimCall(spec.tool, input, current?.run);
    const scope = current ?? requested?.scope ?? newScope();
    const stepId = newStepId();
    scope.lastStepId = stepId;
    let call = buildCall(spec.tool, input, scope, stepId);

    // 2. Permission
    const allowed = permission(scope, spec.tool, requested);
    recordDecision(call, allowed);
    if (allowed.decision === "block") {
        return refuse(spec, call, requested, allowed);
    }

    // Masked data is what gets checked, approved and sent
    const masked = maskArgs(spec.list, runArgs);
    if (masked !== undefined) {
        runArgs = masked;
        input = inputOf(runArgs);
        call = buildCall(spec.tool, input, scope, stepId);
        recordDecision(call, { guard: "egress", rule: "payload:mask", decision: "strip", mode: "block" });
    }

    // 3 to 5. Labels, checks and the decision
    let checked = preChecks(call, spec.list, true);
    checked.forEach((result) => recordDecision(call, result));
    let final = decide(checked);

    // 6. Approval, then the block checks again with no wait before counting
    let approvedArgs: string | undefined;
    if (final?.decision === "ask") {
        const approval = spec.list.find((item): item is ApprovalOptions => item.type === "approval");
        approvedArgs = canonicalJson(input);
        const answer = await askHuman(call, asksOf(checked), approval?.timeout, signal);
        const stopped = answer === "approved" ? changed(call, approvedArgs) : answer;
        if (stopped !== undefined) {
            return refuse(spec, call, requested, stopped);
        }
        call = buildCall(spec.tool, input, scope, stepId);
        checked = preChecks(call, spec.list, false);
        checked.forEach((result) => recordDecision(call, result));
        final = decide(checked);
        // The human already said yes to every other ask
        final = final?.decision === "block" ? final : undefined;
    }
    if (final !== undefined) {
        return refuse(spec, call, requested, final);
    }

    // 7. Count, then run inside the scope so calls made by the tool join
    // this run. A call its caller gave up on is not counted.
    const stop =
        callAborted(call, signal) ??
        (await countCall(call, spec.list, checked)) ??
        changed(call, approvedArgs) ??
        callAborted(call, signal);
    if (stop !== undefined) {
        return refuse(spec, call, requested, stop);
    }
    const ran = call;
    const output = await withScope(scope, () => runTool(spec.fn, runArgs, ran, requested));

    // 8 and 9. Output checks; every step above was recorded
    const shown = await finishOutput(spec.list, call, output, requested);
    if ("blocked" in shown) {
        return refuse(spec, call, undefined, shown.blocked, true);
    }
    return shown.output;
}

type Guarded<F extends (...args: never[]) => unknown> = (
    signal: AbortSignal | undefined,
    args: Parameters<F>,
) => Promise<Awaited<ReturnType<F>> | GuardRefusal>;

// guard() with an abort signal for each call. An aborted call stops
// waiting for approval, uses up no limits and never runs the tool.
export function guardWithSignal<F extends (...args: never[]) => unknown>(
    fn: F,
    options: GuardOptions | GuardOptions[],
): Guarded<F> {
    const list = Array.isArray(options) ? options : [options];
    for (const item of list) {
        if (!isGuardType(item.type)) {
            throw new Error(`Unknown guard type: ${String(item.type)}`);
        }
        if (item.type === "approval" && item.timeout !== undefined && !(item.timeout > 0)) {
            throw new Error("An approval timeout must be a positive number of seconds");
        }
    }
    const tool = list.find((item) => item.name !== undefined)?.name;
    if (tool === undefined || tool === "") {
        throw new Error("guard() needs options.name: the tool name the model sees");
    }
    registerGuardedTool(tool, list);
    syncRules();
    const spec: Spec = { fn, list, tool };
    type Result = Awaited<ReturnType<F>> | GuardRefusal;
    return async (signal, args): Promise<Result> => {
        const result: unknown = await runPipeline(spec, args, signal);
        return result as Result;
    };
}

// Wraps a tool so every call runs the guard pipeline. `name` is the tool
// name the model sees; it keeps rule history and permissions stable.
export function guard<F extends (...args: never[]) => unknown>(
    fn: F,
    options: GuardOptions | GuardOptions[],
): (...args: Parameters<F>) => Promise<Awaited<ReturnType<F>> | GuardRefusal> {
    const guarded = guardWithSignal(fn, options);
    return (...args) => guarded(undefined, args);
}

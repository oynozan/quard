import { labelFor, newStepId } from "@quard/shared";
import { getConfig } from "../core/config.ts";
import { GuardBlockedError, GuardRefusal } from "../core/refusal.ts";
import { claimCall, registerGuardedTool, type RequestedCall } from "../context/registry.ts";
import { currentScope, mayUse, newScope, withScope, type Scope } from "../context/scope.ts";
import type { FailResult, GuardCall, RuleResult } from "../guards/call.ts";
import type { GuardOptions } from "../guards/options.ts";
import { isGuardType } from "../guards/types.ts";
import { labelArguments } from "../labels/value-labels.ts";
import { askHuman } from "./approve.ts";
import { countLimits, decide, preChecks, recordDecision } from "./checks.ts";
import { finishOutput, recordToolCall, runTool } from "./output.ts";
import { snapshot } from "./snapshot.ts";

type Spec = {
    fn: (...args: never[]) => unknown;
    list: GuardOptions[];
    tool: string;
};

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

// Records the block and returns a refusal, or throws when the guard that
// caused the block sets onBlock: "throw"
function refuse(spec: Spec, call: GuardCall, requested: RequestedCall | undefined, result: FailResult): GuardRefusal {
    recordToolCall(call, requested, "blocked", Date.now());
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

async function runPipeline(spec: Spec, args: unknown[]): Promise<unknown> {
    // One copy of the arguments is used for checks, approval and the run
    const runArgs = snapshot(args);
    const input = runArgs.length === 1 ? runArgs[0] : runArgs;

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

    // 3 to 5. Labels, checks and the decision
    const results = preChecks(call, spec.list, true);
    results.forEach((result) => recordDecision(call, result));
    let final = decide(results);

    // 6. Approval, then the block checks again with no wait before counting
    if (final?.decision === "ask") {
        const answer = await askHuman(call);
        if (answer !== "approved") {
            return refuse(spec, call, requested, answer);
        }
        call = buildCall(spec.tool, input, scope, stepId);
        const again = preChecks(call, spec.list, false);
        again.forEach((result) => recordDecision(call, result));
        final = decide(again);
        // The human already said yes to every other ask
        final = final?.decision === "block" ? final : undefined;
    }
    if (final !== undefined) {
        return refuse(spec, call, requested, final);
    }

    // 7. Run inside the scope, so calls made by the tool join this run
    countLimits(call, spec.list);
    const ran = call;
    const output = await withScope(scope, () => runTool(spec.fn, runArgs, ran, requested));

    // 8 and 9. Output checks; every step above was recorded
    const shown = finishOutput(spec.list, call, output, requested);
    if (shown === "blocked") {
        return refuse(spec, call, undefined, {
            guard: "source",
            rule: "source",
            decision: "block",
            mode: "block",
            reason: "content_blocked",
        });
    }
    return shown.output;
}

// Wraps a tool so every call runs the guard pipeline. `name` is the tool
// name the model sees; it keeps rule history and permissions stable.
export function guard<F extends (...args: never[]) => unknown>(
    fn: F,
    options: GuardOptions | GuardOptions[],
): (...args: Parameters<F>) => Promise<Awaited<ReturnType<F>> | GuardRefusal> {
    const list = Array.isArray(options) ? options : [options];
    for (const item of list) {
        if (!isGuardType(item.type)) {
            throw new Error(`Unknown guard type: ${String(item.type)}`);
        }
    }
    const tool = list.find((item) => item.name !== undefined)?.name;
    if (tool === undefined || tool === "") {
        throw new Error("guard() needs options.name: the tool name the model sees");
    }
    registerGuardedTool(tool);
    const spec: Spec = { fn, list, tool };
    type Result = Awaited<ReturnType<F>> | GuardRefusal;
    return async (...args: Parameters<F>): Promise<Result> => {
        const result: unknown = await runPipeline(spec, args);
        return result as Result;
    };
}

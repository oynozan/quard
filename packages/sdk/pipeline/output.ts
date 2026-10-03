import { extractValues, labelFor, type Label } from "@quard/shared";
import { getConfig } from "../core/config.ts";
import { now, record } from "../core/recorder.ts";
import type { RequestedCall } from "../context/registry.ts";
import type { FailResult, GuardCall } from "../guards/call.ts";
import type { GuardOptions, SourceOptions } from "../guards/options.ts";
import { checkSource, originFor } from "../guards/source/source.ts";
import { textOf } from "../labels/text-of.ts";
import { currentPreset } from "../policy/state.ts";
import { recordDecision } from "./checks.ts";
import { detectContent, signContent } from "./content.ts";

const CONTENT_BLOCKED: FailResult = {
    guard: "source",
    rule: "source",
    decision: "block",
    mode: "block",
    reason: "content_blocked",
};

export function recordToolCall(
    call: GuardCall,
    requested: RequestedCall | undefined,
    status: "ok" | "error" | "blocked",
    started: number,
    error?: unknown,
): void {
    record({
        type: "tool_call",
        runId: call.runId,
        stepId: call.stepId,
        agent: call.agent,
        at: now(),
        tool: call.tool,
        callId: requested?.callId,
        arguments: call.input,
        status,
        influenced: call.context.trust === "untrusted",
        flagged: call.context.flagged,
        durationMs: Date.now() - started,
        error: error === undefined ? undefined : error instanceof Error ? error.message : String(error),
    });
}

// Runs the tool with exactly the checked arguments
export async function runTool(
    fn: (...args: never[]) => unknown,
    args: unknown[],
    call: GuardCall,
    requested: RequestedCall | undefined,
): Promise<unknown> {
    const started = Date.now();
    try {
        const output = await fn(...(args as never[]));
        recordToolCall(call, requested, "ok", started);
        return output;
    } catch (error) {
        recordToolCall(call, requested, "error", started, error);
        throw error;
    }
}

// Values the call's own input holds. A result that echoes them back
// gains no trust for them; they keep the labels they had before.
function echoedKeys(call: GuardCall): ReadonlySet<string> {
    return new Set(extractValues(textOf(call.input)).flatMap((value) => value.keys));
}

function indexOutput(call: GuardCall, output: unknown, label: Label): void {
    const added = call.run.index.add(textOf(output), label, call.stepId, { exclude: echoedKeys(call) });
    if (added !== undefined) {
        record({
            type: "content",
            runId: call.runId,
            stepId: call.stepId,
            agent: call.agent,
            at: now(),
            contentId: added.id,
            origin: label.origin,
            trust: label.trust,
            sensitivity: label.sensitivity,
            flags: label.flags,
            keys: added.keys,
        });
    }
}

// Labels, scans and indexes the result before the agent sees it.
// Returns what the agent gets, or why a guard withheld it.
export async function finishOutput(
    list: readonly GuardOptions[],
    call: GuardCall,
    output: unknown,
    requested: RequestedCall | undefined,
): Promise<{ output: unknown } | { blocked: FailResult }> {
    const overrides = getConfig().origins;
    const found = list.find((options): options is SourceOptions => options.type === "source");
    if (found === undefined) {
        const label = labelFor(`tool:${call.tool}`, overrides);
        if (requested !== undefined) {
            requested.outputLabel = label;
        }
        indexOutput(call, output, label);
        return { output };
    }
    // The policy file's strictness sets what suspect content gets, unless the guard says
    const source = { ...found, onSuspect: found.onSuspect ?? currentPreset().onSuspect };
    const result = checkSource(source, originFor(source, call.input, call.tool), output, overrides);
    const mode = source.mode ?? "block";
    const enforced = mode === "block";
    recordDecision(call, {
        guard: "source",
        rule: "source",
        decision: result.decision,
        mode,
        reason: result.findings.length > 0 ? result.findings.join(",") : undefined,
    });
    if (requested !== undefined) {
        requested.outputLabel = result.label;
    }
    if (enforced && result.decision === "block") {
        return { blocked: CONTENT_BLOCKED };
    }
    const signed = signContent(call, { output: result.output, label: result.label }, enforced);
    if ("blocked" in signed) {
        return signed;
    }
    const shown = await detectContent(call, signed, enforced);
    if (requested !== undefined) {
        requested.outputLabel = shown.label;
    }
    indexOutput(call, shown.output, shown.label);
    return { output: shown.output };
}

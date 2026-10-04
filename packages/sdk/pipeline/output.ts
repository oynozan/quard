import { extractValues, labelFor, originKind, type Label } from "@quard/shared";
import { getConfig } from "../core/config.ts";
import { now, record } from "../core/recorder.ts";
import { incomingMessage } from "../context/carrier.ts";
import type { RequestedCall } from "../context/registry.ts";
import { currentScope } from "../context/scope.ts";
import type { FailResult, GuardCall } from "../guards/call.ts";
import type { GuardOptions, SourceOptions } from "../guards/options.ts";
import { checkSource, originFor, receiveMessage, type Received } from "../guards/source/source.ts";
import type { AddOptions } from "../labels/content-index.ts";
import { isLabelRef } from "../labels/records.ts";
import { textOf } from "../labels/text-of.ts";
import { currentPreset } from "../policy/state.ts";
import { recordDecision } from "./checks.ts";
import { signContent } from "./content.ts";
import { detectContent } from "./detect/detect.ts";

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

// skipEmpty: content that adds no value keys is not worth an event
function indexText(
    call: GuardCall,
    text: string,
    label: Label,
    stepId: string,
    options: AddOptions,
    skipEmpty = false,
): void {
    const added = call.run.index.add(text, label, stepId, options);
    if (added !== undefined && !(skipEmpty && added.keys.length === 0)) {
        record({
            type: "content",
            runId: call.runId,
            stepId,
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

// Values a verified message holds that its record did not vouch for.
// The sender's model wrote them, so they stay model-generated here.
function unvouchedKeys(text: string, message: Received | undefined): string[] {
    if (message?.verified !== true) {
        return [];
    }
    const vouched = new Set(message.values.map((value) => value.key));
    const found = extractValues(text);
    const isVouched = (value: (typeof found)[number]) => vouched.has(`${value.type}:${value.value}`);
    // A host a vouched value shares still takes the message's label
    const kept = new Set(found.filter(isVouched).flatMap((value) => value.keys));
    return found.flatMap((value) => (isVouched(value) ? [] : value.keys.filter((key) => !kept.has(key))));
}

// A message from another agent first brings in the labels its values had
// in the sender's run, so a web-derived IBAN stays web-derived here
function indexOutput(call: GuardCall, output: unknown, label: Label, message?: Received): void {
    for (const { value, key, origin, trust, sensitivity, flags, stepId } of message?.values ?? []) {
        // Only the value's own key: its host and domain take the message's label
        const exclude = new Set(extractValues(value).flatMap((found) => found.keys.filter((other) => other !== key)));
        const label = { origin, kind: originKind(origin), trust, sensitivity, flags };
        indexText(call, value, label, stepId, { exclude, keepEarlier: true }, true);
    }
    const text = textOf(output);
    const exclude = new Set([...echoedKeys(call), ...unvouchedKeys(text, message)]);
    indexText(call, text, label, call.stepId, { exclude, keepEarlier: message !== undefined });
}

// For an "agent" source: who sent the message and what the sender vouched for
async function received(source: SourceOptions, call: GuardCall, output: unknown): Promise<Received | undefined> {
    if (source.origin !== "agent") {
        return undefined;
    }
    const incoming = await incomingMessage(source.carrierOf?.(call.input), currentScope());
    return receiveMessage(incoming, output, getConfig().origins);
}

// The edge from the sender to this agent in the run graph
function recordMessage(call: GuardCall, message: Received, label: Label): void {
    const { carrier } = message;
    record({
        type: "message",
        runId: call.runId,
        stepId: call.stepId,
        agent: call.agent,
        at: now(),
        from: message.from,
        parentStepId: carrier?.parentStepId,
        labelRef: carrier !== undefined && isLabelRef(carrier.labelRef) ? carrier.labelRef : undefined,
        verified: message.verified,
        trust: label.trust,
        sensitivity: label.sensitivity,
    });
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
    const message = await received(source, call, output);
    const origin = message?.origin ?? originFor(source, call.input, call.tool);
    const result = checkSource(source, origin, output, message?.overrides ?? overrides);
    if (message !== undefined) {
        recordMessage(call, message, result.label);
    }
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
    indexOutput(call, shown.output, shown.label, message);
    return { output: shown.output };
}

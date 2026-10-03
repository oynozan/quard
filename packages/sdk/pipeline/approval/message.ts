import {
    askMessage,
    canonicalJson,
    keyedHash,
    newEventId,
    plainJson,
    redactText,
    stripSecrets,
    tooDeepToStrip,
    type ArgumentLabelMessage,
    type AskMessage,
} from "@quard/shared";
import type { FailResult, GuardCall } from "../../guards/call.ts";
import type { ArgumentLabel } from "../../labels/value-labels.ts";
import { MAX_MESSAGE } from "../../transport/link/link.ts";

// Why a call can't be shown to the approver, as the rule that refuses it
export type Unshown = "unsendable" | "too-deep-to-show";

// Where each argument value came from, without the values themselves.
// Origins and paths can hold emails or keys, so they are redacted.
function labelsOf(values: readonly ArgumentLabel[]): ArgumentLabelMessage[] {
    return values.slice(0, 500).map(({ path, values }) => ({
        path: redactText(path).slice(0, 1000),
        values: values.slice(0, 50).map((value) => ({
            type: value.type,
            generated: value.modelGenerated,
            origins: value.occurrences.slice(0, 50).map((occurrence) => ({
                origin: redactText(occurrence.origin).slice(0, 2000),
                trust: occurrence.trust,
                sensitivity: occurrence.sensitivity,
                flags: occurrence.flags.slice(0, 20).map((flag) => flag.slice(0, 100)),
                stepId: occurrence.stepId,
                match: occurrence.match,
            })),
        })),
    }));
}

// The ask for the dashboard, or why it can't be shown
export function askFor(
    call: GuardCall,
    asks: readonly FailResult[],
    hashKey: Buffer,
    rules: string | undefined,
): AskMessage | Unshown {
    const { context } = call;
    const args = plainJson(call.input);
    // Deeper values would be cut, and no one may approve what they can't see
    if (tooDeepToStrip(args)) {
        return "too-deep-to-show";
    }
    const parsed = askMessage.safeParse({
        type: "ask",
        askId: newEventId(),
        runId: call.runId,
        stepId: call.stepId,
        agent: call.agent,
        tool: call.tool,
        // The hash covers secrets too, so a changed secret asks again
        argsHash: keyedHash(hashKey, "args", canonicalJson(call.input)),
        // The approver sees real values, with secrets removed
        args: stripSecrets(args),
        labels: labelsOf(call.values),
        context: {
            trust: context.trust,
            sensitivity: context.sensitivity,
            origins: context.origins.slice(0, 200).map((origin) => redactText(origin).slice(0, 2000)),
            flagged: context.flagged,
        },
        reasons: asks.slice(0, 50).map(({ guard, rule, reason, field }) => ({
            guard,
            rule: rule.slice(0, 200),
            reason,
            field: field?.slice(0, 200),
        })),
        rules,
    });
    return parsed.success && Buffer.byteLength(JSON.stringify(parsed.data)) <= MAX_MESSAGE ? parsed.data : "unsendable";
}

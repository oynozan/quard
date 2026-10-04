import { labelFor, type Label } from "@quard/shared";
import { getConfig } from "../core/config.ts";
import { now, record } from "../core/recorder.ts";
import { findCall, findConversation, findResponse, registerConversation } from "../context/registry.ts";
import type { AddOptions } from "../labels/content-index.ts";
import { briefLabel } from "./agent-brief.ts";
import { unguardedOutputLabel } from "./framework-tools.ts";
import type { Step } from "./step.ts";

const UNSEEN_HISTORY = "Earlier conversation history that Quard did not see.";

// Adds content to the run's index and records it, unless seen before
export function indexContent(step: Step, text: string, label: Label, options: AddOptions = {}): void {
    const added = step.scope.run.index.add(text, label, step.stepId, options);
    if (added === undefined) {
        return;
    }
    record({
        type: "content",
        runId: step.scope.run.runId,
        stepId: step.stepId,
        agent: step.scope.agent,
        at: now(),
        contentId: added.id,
        origin: label.origin,
        trust: label.trust,
        sensitivity: label.sensitivity,
        flags: label.flags,
        keys: added.keys,
    });
}

// Labels what the model is about to read. Content seen before keeps its
// label, and so do values in it that were seen before. History Quard
// never saw counts as untrusted.
export function labelInput(step: Step): void {
    const { scope, request } = step;
    const overrides = getConfig().origins;
    const chainedUnseen =
        (request.previousResponseId !== undefined && findResponse(request.previousResponseId) === undefined) ||
        (request.conversationId !== undefined && findConversation(request.conversationId) === undefined);
    if (chainedUnseen) {
        indexContent(step, UNSEEN_HISTORY, labelFor("unknown", overrides));
    }
    for (const item of request.texts) {
        if (item.role === "tool") {
            const requested = findCall(item.callId);
            indexContent(step, item.text, requested?.outputLabel ?? unguardedOutputLabel(requested, overrides), {
                exclude: requested?.argKeys,
                keepEarlier: requested?.outputLabel === undefined,
            });
        } else {
            // An agent run as a tool reads its caller's brief as user input
            const brief = item.role === "user" ? briefLabel(scope, item.text) : undefined;
            indexContent(step, item.text, brief ?? labelFor(item.role, overrides), { keepEarlier: true });
        }
    }
    if (request.conversationId !== undefined) {
        registerConversation(request.conversationId, scope);
    }
}

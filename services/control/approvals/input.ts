import type { ApprovalRequestDetail, ApprovalRequestInput, ApprovalWaiterInput } from "@quard/db";
import { stripSecrets, type AskMessage, type Redactor } from "@quard/shared";

// Secrets are removed again, in case an old SDK sent one
export function requestInput(ask: AskMessage, redactor: Redactor): ApprovalRequestInput {
    const args = stripSecrets(ask.args);
    return {
        runId: ask.runId,
        stepId: ask.stepId,
        agent: ask.agent,
        tool: ask.tool,
        argsHash: ask.argsHash,
        args,
        masked: redactor.value(args),
        // Paths and origins can hold emails or IBANs, so they are stored redacted
        labels: redactor.value(ask.labels) as ApprovalRequestInput["labels"],
        context: redactor.value(ask.context) as ApprovalRequestInput["context"],
        reasons: ask.reasons,
        rulesHash: ask.rules ?? null,
    };
}

export function waiterInput(ask: AskMessage, requestId: string): ApprovalWaiterInput {
    return { askId: ask.askId, requestId, runId: ask.runId, stepId: ask.stepId, agent: ask.agent };
}

// An answer holds only for the same agent, tool and arguments
export function sameCall(request: ApprovalRequestDetail, ask: AskMessage): boolean {
    return request.agent === ask.agent && request.tool === ask.tool && request.argsHash === ask.argsHash;
}

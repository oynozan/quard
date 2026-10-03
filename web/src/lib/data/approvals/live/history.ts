import type { ApprovalGrantItem, DecidedApprovalItem } from "@quard/db";
import { flatten } from "../../runs/live/values";
import type { AlwaysGrant, ApprovalAnswer, ApprovalCode, ApprovalDecision } from "../types";

const ANSWER: Record<ApprovalCode, ApprovalAnswer> = {
    once: "approve once",
    always: "always approve",
    deny: "deny",
};

const ms = (date: Date) => date.getTime();

// After the decision only the masks are kept
function maskedArgs(masked: unknown): { name: string; value: string }[] {
    if (masked === null || masked === undefined) return [];
    return flatten(masked).map(({ path, value }) => ({ name: path, value }));
}

export function decisionOf(item: DecidedApprovalItem): ApprovalDecision {
    return {
        requestId: item.id,
        runId: item.runId,
        stepId: item.stepId,
        agent: item.agent,
        tool: item.tool,
        answer: ANSWER[item.answer],
        by: item.decidedBy ?? "unknown",
        openedAt: ms(item.openedAt),
        decidedAt: ms(item.decidedAt),
        argsHash: item.argsHash,
        args: maskedArgs(item.masked),
    };
}

export function grantOf(grant: ApprovalGrantItem): AlwaysGrant {
    return {
        id: grant.id,
        agent: grant.agent,
        tool: grant.tool,
        argsHash: grant.argsHash,
        args: maskedArgs(grant.masked),
        approvedBy: grant.approvedBy,
        approvedAt: ms(grant.approvedAt),
        timesUsed: grant.timesUsed,
        lastUsedAt: grant.lastUsedAt ? ms(grant.lastUsedAt) : null,
        revokedAt: grant.revokedAt ? ms(grant.revokedAt) : null,
        revokedBy: grant.revokedBy,
    };
}

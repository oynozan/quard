import type { AlwaysGrant, ApprovalAnswer, ApprovalDecision, ApprovalDetail } from "@/lib/data/approvals/types";
import type { GuardDecision } from "@/lib/data/runs/types";
import { SIGNED_IN } from "@/lib/data/session";

// Live requests first, because a process is blocked on them right now.
// Inside each group the longest wait sits on top, so nobody is skipped.
export function orderOpen(open: ApprovalDetail[]): ApprovalDetail[] {
    const live = (item: ApprovalDetail) => (item.heartbeat.state === "live" ? 0 : 1);
    return [...open].sort((a, b) => live(a) - live(b) || a.request.openedAt - b.request.openedAt);
}

// Who answers in this session
export const CURRENT_USER = SIGNED_IN.email;

// After a decision only the hash and the masked values stay.
export function decisionOf(item: ApprovalDetail, answer: ApprovalAnswer, at: number): ApprovalDecision {
    return {
        requestId: item.request.id,
        runId: item.request.runId,
        stepId: item.request.stepId,
        agent: item.request.agent,
        tool: item.request.tool,
        answer,
        by: CURRENT_USER,
        openedAt: item.request.openedAt,
        decidedAt: at,
        argsHash: item.argsHash,
        args: item.args.map((arg) => ({ name: arg.name, value: arg.masked })),
    };
}

export function grantOf(item: ApprovalDetail, at: number): AlwaysGrant {
    return {
        id: `grant_${item.argsHash.slice(0, 4)}`,
        agent: item.request.agent,
        tool: item.request.tool,
        argsHash: item.argsHash,
        args: item.args.map((arg) => ({ name: arg.name, value: arg.masked })),
        approvedBy: CURRENT_USER,
        approvedAt: at,
        timesUsed: 0,
        lastUsedAt: null,
        revokedAt: null,
        revokedBy: null,
    };
}

export const ANSWER_WORD: Record<ApprovalAnswer, string> = {
    "approve once": "Approved once",
    "always approve": "Always approved",
    deny: "Denied",
};

// What each answer did, for the toast and the live region.
export function answerMessage(answer: ApprovalAnswer, tool: string): string {
    if (answer === "deny") return `Denied ${tool}. The call returns a refusal`;
    if (answer === "always approve") return `Always approved ${tool} for these exact arguments`;
    return `Approved ${tool} once`;
}

// Guard checks in plain words. Observe mode ran the call anyway.
type CheckTone = "context" | "warning" | "danger";
export function checkWord(decision: GuardDecision): { word: string; tone: CheckTone } {
    if (decision.outcome === "ask") return { word: "Asks a human", tone: "warning" };
    if (decision.mode === "observe" && decision.outcome === "block") return { word: "Would block", tone: "warning" };
    if (decision.outcome === "allow" || decision.outcome === "pass") return { word: "Allowed", tone: "context" };
    const word = decision.outcome.charAt(0).toUpperCase() + decision.outcome.slice(1);
    return {
        word: decision.outcome === "block" ? "Blocked" : word,
        tone: decision.outcome === "block" ? "danger" : "warning",
    };
}

// A check that let the call through. These fold away behind one count.
export function passedCheck(decision: GuardDecision): boolean {
    return decision.outcome === "allow" || decision.outcome === "pass";
}

export function argsLine(args: { name: string; value: string }[]): string {
    return args.map((arg) => `${arg.name}=${arg.value}`).join("  ");
}

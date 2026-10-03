import type {
    AlwaysGrant,
    ApprovalAnswer,
    ApprovalCode,
    ApprovalDecision,
    ApprovalDetail,
} from "@/lib/data/approvals/types";
import type { GuardDecision } from "@/lib/data/runs/types";
import { formatOutcome } from "@/lib/format";

// Live requests first, because a process is blocked on them right now.
// Inside each group the longest wait sits on top, so nobody is skipped.
export function orderOpen(open: ApprovalDetail[]): ApprovalDetail[] {
    const live = (item: ApprovalDetail) => (item.heartbeat.state === "live" ? 0 : 1);
    return [...open].sort((a, b) => live(a) - live(b) || a.request.openedAt - b.request.openedAt);
}

// The answer as the server stores it
export const ANSWER_CODE: Record<ApprovalAnswer, ApprovalCode> = {
    "approve once": "once",
    "always approve": "always",
    deny: "deny",
};

// After a decision only the hash and the masked values stay.
export function decisionOf(item: ApprovalDetail, answer: ApprovalAnswer, at: number, by: string): ApprovalDecision {
    return {
        requestId: item.request.id,
        runId: item.request.runId,
        stepId: item.request.stepId,
        agent: item.request.agent,
        tool: item.request.tool,
        answer,
        by,
        openedAt: item.request.openedAt,
        decidedAt: at,
        argsHash: item.argsHash,
        args: item.args.map((arg) => ({ name: arg.name, value: arg.masked })),
    };
}

// A grant shown before the server confirms it. Its id is a stand-in until then.
export function grantOf(item: ApprovalDetail, at: number, by: string): AlwaysGrant {
    return {
        id: `pending-${item.request.id}`,
        agent: item.request.agent,
        tool: item.request.tool,
        argsHash: item.argsHash,
        args: item.args.map((arg) => ({ name: arg.name, value: arg.masked })),
        approvedBy: by,
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
    const observe = decision.mode === "observe";
    if (decision.outcome === "allow" || decision.outcome === "pass") return { word: "Allowed", tone: "context" };
    if (decision.outcome === "ask" && !observe) return { word: "Asks a human", tone: "warning" };
    return {
        word: formatOutcome(decision.outcome, decision.mode),
        tone: decision.outcome === "block" && !observe ? "danger" : "warning",
    };
}

// A check that let the call through. These fold away behind one count.
export function passedCheck(decision: GuardDecision): boolean {
    return decision.outcome === "allow" || decision.outcome === "pass";
}

export function argsLine(args: { name: string; value: string }[]): string {
    return args.map((arg) => `${arg.name}=${arg.value}`).join("  ");
}

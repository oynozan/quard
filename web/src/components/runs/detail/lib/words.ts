import type { GuardDecision, Step, StepStatus } from "@/lib/data/runs/types";
import type { DecisionGuard, StepKind } from "@/lib/data/types";

export const KIND_WORD: Record<StepKind, string> = {
    model_call: "Model call",
    tool_call: "Tool call",
    guard_decision: "Guard decision",
    message: "Message",
    handoff: "Handoff",
    approval: "Approval",
    memory_read: "Memory read",
    memory_write: "Memory write",
};

export const EDGE_WORD = { delegation: "Delegation", handoff: "Handoff", message: "Message" };

export const GUARD_WORD: Record<DecisionGuard, string> = {
    source: "Source guard",
    action: "Action guard",
    approval: "Approval guard",
    egress: "Egress guard",
    limit: "Limit guard",
    permission: "Permission check",
    signature: "Signature feed",
};

export const STATUS_WORD: Record<StepStatus, string> = {
    ok: "Ok",
    error: "Failed",
    blocked: "Blocked",
    waiting: "Waiting",
    running: "Running",
};

export const STATUS_TONE: Record<StepStatus, "on" | "context" | "warning" | "danger"> = {
    ok: "context",
    error: "danger",
    blocked: "danger",
    waiting: "warning",
    running: "on",
};

// What the decision did. Observe mode only records what it would have done.
export function decisionWord(guard: GuardDecision): string {
    const observe = guard.mode === "observe";
    switch (guard.outcome) {
        case "block":
            return observe ? "Would block" : "Blocked";
        case "ask":
            return observe ? "Would ask" : "Asked a human";
        case "allow":
            return "Allowed";
        case "pass":
            return "Passed";
        case "strip":
            return "Stripped";
        case "flag":
            return "Flagged";
    }
}

// Marks under a timeline cell. Red for blocked or failed, amber while a human is asked.
export type MarkKind = "block" | "ask" | "would-block" | "would-ask";

export function stepMark(step: Step): MarkKind | null {
    const guard = step.guard;
    if (guard?.outcome === "block") return guard.mode === "observe" ? "would-block" : "block";
    if (guard?.outcome === "ask") return guard.mode === "observe" ? "would-ask" : "ask";
    if (step.status === "error" || step.status === "blocked") return "block";
    if (step.status === "waiting") return "ask";
    return null;
}

export const MARK_WORD: Record<MarkKind, string> = {
    block: "Blocked or failed",
    ask: "Waiting for a human",
    "would-block": "Would block",
    "would-ask": "Would ask",
};

// Time since the run started: "0.42 s", "9.2 s", "4 min 15 s".
export function formatOffset(ms: number): string {
    if (ms < 1000) return `${(ms / 1000).toFixed(2)} s`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
    const seconds = Math.round(ms / 1000);
    return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function formatStepDuration(ms: number): string {
    return ms < 1000 ? `${ms} ms` : formatOffset(ms);
}

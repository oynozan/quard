import type { AgentCall } from "@/lib/data/agents";
import type { StepKind } from "@/lib/data/types";
import { formatOutcome } from "@/lib/format";

export type Lane = { key: string; word: string; short: string; kinds: StepKind[] };

const LANES: Lane[] = [
    { key: "model", word: "Model calls", short: "Model", kinds: ["model_call"] },
    { key: "tool", word: "Tool calls", short: "Tool", kinds: ["tool_call"] },
    { key: "guard", word: "Guard decisions", short: "Guard", kinds: ["guard_decision"] },
    { key: "approval", word: "Approvals", short: "Approval", kinds: ["approval"] },
    { key: "message", word: "Messages", short: "Message", kinds: ["message", "handoff"] },
    { key: "memory", word: "Memory", short: "Memory", kinds: ["memory_read", "memory_write"] },
];

export const KIND_WORD: Record<StepKind, string> = {
    model_call: "Model call",
    tool_call: "Tool call",
    guard_decision: "Guard decision",
    approval: "Approval",
    message: "Message",
    handoff: "Handoff",
    memory_read: "Memory read",
    memory_write: "Memory write",
};

// Only the lanes these calls use, in a fixed order
export function lanesFor(calls: AgentCall[]): Lane[] {
    return LANES.filter((lane) => calls.some((call) => lane.kinds.includes(call.kind)));
}

export type MarkKind = "block" | "ask" | "would-block" | "would-ask";

export const MARK_WORD: Record<MarkKind, string> = {
    block: "Blocked",
    ask: "Asked",
    "would-block": "Would block",
    "would-ask": "Would ask",
};

// The decision mark under a call: what a guard did, or would have done in observe mode
export function markOf(call: AgentCall): MarkKind | null {
    const observe = call.mode === "observe";
    if (call.outcome === "block") return observe ? "would-block" : "block";
    if (call.outcome === "ask") return observe ? "would-ask" : "ask";
    if (call.status === "blocked") return "block";
    return null;
}

export function outcomeWord(call: AgentCall): string {
    return call.outcome ? formatOutcome(call.outcome, call.mode) : "—";
}

export function markColor(kind: MarkKind): string {
    return kind === "block" || kind === "would-block" ? "var(--danger)" : "var(--warning)";
}

export type TimelineFit = { shown: number; pitch: number; cell: number; labelWidth: number; rowHeight: number };

// Fits as many recent calls as the width allows, never below a 4px cell
export function fitTimeline(width: number, count: number): TimelineFit {
    const labelWidth = width < 560 ? 66 : 110;
    const plot = Math.max(0, width - labelWidth);
    const pitch = Math.max(6, Math.min(14, Math.floor(plot / Math.max(1, count))));
    const shown = Math.min(count, Math.floor(plot / pitch));
    return { shown, pitch, cell: pitch - 2, labelWidth, rowHeight: Math.max(18, pitch + 4) };
}

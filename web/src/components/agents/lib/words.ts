import type { AgentEdge } from "@/lib/data/agents";
import type { AgentState } from "@/lib/data/types";

export const STATE_WORD: Record<AgentState, string> = { running: "Running", idle: "Idle", offline: "Offline" };

export const STATE_TONE: Record<AgentState, "on" | "context" | "off"> = {
    running: "on",
    idle: "context",
    offline: "off",
};

export const ROLE_WORD = { entry: "Entry point", turning: "Turning point", damage: "Damage" } as const;

export function plural(count: number, one: string, many = `${one}s`): string {
    return count === 1 ? one : many;
}

// The kinds an edge carries, such as "3,020 delegations" or "86 handoffs, 12 messages"
export function edgeKinds(edge: AgentEdge): string {
    const parts: string[] = [];
    if (edge.delegations)
        parts.push(`${edge.delegations.toLocaleString("en-US")} ${plural(edge.delegations, "delegation")}`);
    if (edge.handoffs) parts.push(`${edge.handoffs.toLocaleString("en-US")} ${plural(edge.handoffs, "handoff")}`);
    if (edge.messages) parts.push(`${edge.messages.toLocaleString("en-US")} ${plural(edge.messages, "message")}`);
    return parts.join(", ") || "No traffic";
}

// The main kind of an edge, for short labels
export function edgeKind(edge: AgentEdge): string {
    const top = Math.max(edge.delegations, edge.handoffs, edge.messages);
    if (top === edge.delegations && top > 0) return "Delegation";
    if (top === edge.handoffs && top > 0) return "Handoff";
    return "Message";
}

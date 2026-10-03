import type { AgentEdge, AgentState } from "@/lib/data/agents";

export const STATE_WORD: Record<AgentState, string> = { running: "Running", idle: "Idle" };

export const STATE_TONE: Record<AgentState, "on" | "context"> = { running: "on", idle: "context" };

export const ROLE_WORD = { entry: "Entry point", turning: "Turning point", damage: "Damage" } as const;

export function plural(count: number, one: string, many = `${one}s`): string {
    return count === 1 ? one : many;
}

// The main kind of an edge, for short labels
export function edgeKind(edge: AgentEdge): string {
    const top = Math.max(edge.delegations, edge.handoffs, edge.messages);
    if (top === edge.delegations && top > 0) return "Delegation";
    if (top === edge.handoffs && top > 0) return "Handoff";
    return "Message";
}

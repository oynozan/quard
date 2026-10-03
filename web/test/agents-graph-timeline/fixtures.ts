import type { AgentCall, AgentEdge, AgentNode } from "@/lib/data/agents";

// 3 Oct 2026, 12:00:00 UTC
export const NOON = Date.UTC(2026, 9, 3, 12, 0, 0);

export function agentNode(name: string, overrides: Partial<AgentNode> = {}): AgentNode {
    return {
        name,
        version: "v3",
        model: "claude-x",
        tools: [],
        state: "idle",
        app: "support",
        runs24h: 0,
        runs30d: 0,
        entryPoints: 0,
        turningPoints: 0,
        damage: 0,
        lastSeenAt: NOON,
        ...overrides,
    };
}

export function agentEdge(from: string, to: string, overrides: Partial<AgentEdge> = {}): AgentEdge {
    return {
        from,
        to,
        delegations: 0,
        handoffs: 0,
        messages: 0,
        total: 0,
        untrusted: 0,
        untrustedShare: 0,
        lastAt: NOON,
        ...overrides,
    };
}

// A planner that delegates to two agents in the second layer, plus one agent with no links
export const NODES: AgentNode[] = [
    agentNode("planner", { state: "running", runs24h: 12, entryPoints: 1, turningPoints: 2 }),
    agentNode("researcher", { runs24h: 1, turningPoints: 1 }),
    agentNode("writer", { state: "offline" }),
    agentNode("archivist"),
];

// Busiest first, as the graph pane sorts them
export const EDGES: AgentEdge[] = [
    agentEdge("planner", "researcher", { delegations: 300, total: 300, untrusted: 9, untrustedShare: 0.03 }),
    agentEdge("planner", "writer", { delegations: 40, total: 40, untrusted: 8, untrustedShare: 0.2 }),
    agentEdge("researcher", "writer", { messages: 12, total: 12, untrusted: 9, untrustedShare: 0.75 }),
];

export function agentCall(stepId: string, overrides: Partial<AgentCall> = {}): AgentCall {
    return {
        runId: `run${stepId}-0000-1111`,
        stepId,
        at: NOON,
        kind: "tool_call",
        name: stepId,
        durationMs: 120,
        status: "ok",
        context: { origin: "user", trust: "trusted", sensitivity: "public" },
        influenced: false,
        detail: "",
        costUsd: null,
        outcome: null,
        mode: null,
        ...overrides,
    };
}

// Newest first, one call per lane and per guard mark
export const CALLS: AgentCall[] = [
    agentCall("s6", {
        at: NOON + 50_000,
        name: "send_email",
        outcome: "block",
        mode: "block",
        context: { origin: "web", trust: "untrusted", sensitivity: "public" },
    }),
    agentCall("s5", { at: NOON + 40_000, kind: "guard_decision", name: "egress", outcome: "ask", mode: "block" }),
    agentCall("s4", { at: NOON + 30_000, name: "delete_file", outcome: "block", mode: "observe" }),
    agentCall("s3", { at: NOON + 20_000, kind: "approval", name: "refund", outcome: "ask", mode: "observe" }),
    agentCall("s2", {
        at: NOON + 10_000,
        kind: "memory_write",
        name: "notes",
        status: "blocked",
        durationMs: 2400,
        context: { origin: "crm", trust: "untrusted", sensitivity: "internal" },
    }),
    agentCall("s1", {
        at: NOON,
        kind: "model_call",
        name: "draft",
        outcome: "allow",
        mode: "block",
        context: { origin: "kb", trust: "trusted", sensitivity: "internal" },
    }),
];

// Many plain calls, newest first, a second apart
export function manyCalls(count: number): AgentCall[] {
    return Array.from({ length: count }, (_, i) =>
        agentCall(`m${count - 1 - i}`, { at: NOON + (count - 1 - i) * 1000 }),
    );
}

import type { StepStatus } from "../runs/types";
import type { Agent, AgentState, GuardMode, Label, Outcome, StepKind } from "../types";

export type AgentNode = {
    name: string;
    version: string;
    model: string;
    tools: string[];
    state: AgentState;
    app: string;
    runs24h: number;
    runs30d: number;
    // Incidents where the root-cause finder named this agent.
    entryPoints: number;
    turningPoints: number;
    damage: number;
    lastSeenAt: number;
};

// Messages between two agents over the window, by kind, and how many carried untrusted content.
export type AgentEdge = {
    from: string;
    to: string;
    delegations: number;
    handoffs: number;
    messages: number;
    total: number;
    untrusted: number;
    // 0 to 1.
    untrustedShare: number;
    lastAt: number;
};

export type AgentGraph = {
    windowDays: number;
    startAt: number;
    endAt: number;
    nodes: AgentNode[];
    edges: AgentEdge[];
};

export type AgentVersionRow = {
    version: string;
    model: string;
    instructionsHash: string;
    tools: string[];
    since: number;
    // When the next version replaced it. Null for the current version.
    until: number | null;
    note: string;
    current: boolean;
    // Incidents tied to this version.
    incidents: string[];
};

// One call in an agent's timeline. Tool calls carry their strictest guard result.
export type AgentCall = {
    runId: string;
    stepId: string;
    at: number;
    kind: StepKind;
    name: string;
    durationMs: number;
    status: StepStatus;
    context: Label;
    influenced: boolean;
    detail: string;
    costUsd: number | null;
    outcome: Outcome | null;
    mode: GuardMode | null;
};

export type AgentStats = {
    runs24h: number;
    modelCalls24h: number;
    costUsd24h: number;
    asked24h: number;
    blocked24h: number;
    // Share of its model calls that had read untrusted content, 0 to 1.
    influencedShare: number;
};

export type AgentDetail = {
    agent: Agent;
    app: { name: string; rulesHash: string; state: "connected" | "offline"; lastSeenAt: number };
    versions: AgentVersionRow[];
    stats: AgentStats;
    // Model calls per hour over the last 24 hours, oldest first.
    activity: number[];
    links: AgentEdge[];
    incidents: { id: string; title: string; roles: ("entry" | "turning" | "damage")[]; openedAt: number }[];
    // Newest first.
    timeline: AgentCall[];
};

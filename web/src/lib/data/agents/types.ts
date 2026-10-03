import type { StepStatus } from "../runs/types";
import type { GuardMode, Label, Outcome, StepKind } from "../types";

// No offline state, since control does not record which agents a connection runs
export type AgentState = "running" | "idle";

export type AgentNode = {
    name: string;
    state: AgentState;
    // The model of its newest model call in the window, if it made one
    model: string | null;
    runs24h: number;
    lastSeenAt: number;
};

// Traffic between two agents over the window, which so far holds delegations only
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
    nodes: AgentNode[];
    edges: AgentEdge[];
};

export type AgentVersionRow = {
    version: string;
    model: string;
    // Null for a version that ran without instructions
    instructionsHash: string | null;
    tools: string[];
    // The tools of the version before it, null for the first version
    toolsBefore: string[] | null;
    since: number;
    // When the next version replaced it. Null for the current version.
    until: number | null;
    note: string;
    current: boolean;
    // Incidents tied to this version.
    incidents: string[];
};

// One call in an agent's timeline, with its strictest guard result
export type AgentCall = {
    runId: string;
    stepId: string;
    at: number;
    kind: StepKind;
    name: string;
    durationMs: number;
    status: StepStatus;
    context: Label;
    outcome: Outcome | null;
    mode: GuardMode | null;
};

export type AgentStats = {
    modelCalls24h: number;
    // Share of its model calls that had read untrusted content, or null without model calls
    influencedShare: number | null;
    costUsd24h: number;
    // False when a model call that answered has no known price
    costKnown: boolean;
    asked24h: number;
    blocked24h: number;
};

// Model calls per hour over 24 hours, oldest first
export type AgentActivity = { startAt: number; perHour: number[] };

export type AgentDetail = {
    agent: AgentNode;
    stats: AgentStats;
    activity: AgentActivity;
    links: AgentEdge[];
    // Newest first
    versions: AgentVersionRow[];
    // Incidents are not recorded yet
    incidents: { id: string; title: string; roles: ("entry" | "turning" | "damage")[]; openedAt: number }[];
    // Newest first.
    timeline: AgentCall[];
};

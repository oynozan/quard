import type { LimitName } from "../guards/limits";
import type { GuardMode, GuardType, Label, Outcome, RunStatus, RunSummary, StepKind, ValueLabel } from "../types";

export type StepStatus = "ok" | "error" | "blocked" | "waiting" | "running";

// One argument of a call. Sensitive values are masked, as the dashboard always shows them.
export type StepArg = {
    name: string;
    value: string;
    masked: boolean;
    valueLabel: ValueLabel;
};

export type ModelUsage = {
    model: string;
    inputTokens: number;
    cachedTokens: number;
    outputTokens: number;
    costUsd: number;
    // Tools the model asked for in its answer.
    toolCalls: string[];
};

// What a source guard found when it scanned content.
export type SourceScan = {
    scanned: boolean;
    findings: string[];
    // Jev score for "instructions aimed at an AI". Observe mode: it never changes a decision.
    jevScore: number | null;
};

export type GuardDecision = {
    guard: GuardType;
    tool: string;
    // The rule's own result. In observe mode the call ran anyway: show it as "would block".
    outcome: Outcome;
    // Null for approval guards, which always ask.
    mode: GuardMode | null;
    rule: string;
    ruleHash: string;
    // The active rules hash the SDK sent on connect.
    rulesHash: string;
    reason: string;
    // Sent late while the backend was unreachable.
    degraded: boolean;
    scan: SourceScan | null;
};

export type LinkKind = "delegation" | "handoff" | "message";
export type Channel = "in-process" | "http" | "queue" | "mcp" | "a2a";

// A message between agents. Only the run id, parent step and a label reference travel.
export type AgentLink = {
    kind: LinkKind;
    from: string;
    to: string;
    channel: Channel;
    carries: Label[];
    labelRef: string;
    untrusted: boolean;
    summary: string;
};

export type MemoryAccess = {
    store: string;
    key: string;
    label: Label;
    // False when the content changed outside the wrapper, so it reads back as untrusted.
    hashOk: boolean;
};

export type ApprovalState = "waiting" | "approved once" | "always approved" | "denied" | "no longer waiting";

export type ApprovalInfo = {
    requestId: string;
    state: ApprovalState;
    by: string | null;
    decidedAt: number | null;
    argsHash: string;
};

export type Step = {
    // 16 hex characters, W3C span format.
    id: string;
    parentId: string | null;
    agent: string;
    kind: StepKind;
    // Model name for model calls, tool name for tool calls, rule name for guard decisions.
    name: string;
    startedAt: number;
    durationMs: number;
    status: StepStatus;
    // The least trusted and most sensitive label among what the model read before this step.
    context: Label;
    influenced: boolean;
    detail: string;
    args: StepArg[];
    // What a tool brought back, with its label.
    output: { label: Label; summary: string } | null;
    model: ModelUsage | null;
    guard: GuardDecision | null;
    link: AgentLink | null;
    memory: MemoryAccess | null;
    approval: ApprovalInfo | null;
    hosted: boolean;
    error: string | null;
};

// One agent in a run. Nodes of the run graph.
export type RunAgent = {
    name: string;
    version: string;
    model: string;
    parent: string | null;
    depth: number;
    tools: string[];
    steps: number;
    modelCalls: number;
    costUsd: number;
    startedAt: number;
    endedAt: number;
    influenced: boolean;
};

// A delegation, handoff or message between two agents, in time order.
export type RunEdge = {
    stepId: string;
    kind: LinkKind;
    from: string;
    to: string;
    at: number;
    channel: Channel;
    carries: Label[];
    untrusted: boolean;
    summary: string;
};

export type RunGraph = { nodes: RunAgent[]; edges: RunEdge[] };

export type RunLimitUse = {
    name: LimitName;
    used: number;
    limit: number;
    unit: string;
    mode: GuardMode;
    // Used is over the limit. In observe mode this is "would stop".
    over: boolean;
};

// A run as the runs list shows it.
export type RunRow = RunSummary & {
    tools: string[];
    incidentId: string | null;
    approvalId: string | null;
};

export type RunDetail = {
    summary: RunRow;
    agents: RunAgent[];
    graph: RunGraph;
    // Time ordered.
    steps: Step[];
    limits: RunLimitUse[];
    rulesHashes: string[];
};

export type RunQuery = {
    query?: string;
    agent?: string;
    status?: RunStatus;
    limit?: number;
};

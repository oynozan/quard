// Domain types for the dashboard. They mirror PROJECT.md.

export type Trust = "trusted" | "untrusted";
export type Sensitivity = "internal" | "public";

export type Label = {
    origin: string;
    trust: Trust;
    sensitivity: Sensitivity;
};

export type GuardType = "source" | "action" | "approval" | "egress" | "limit";
export type Outcome = "allow" | "ask" | "block" | "pass" | "strip" | "flag";
export type RunStatus = "running" | "waiting" | "completed" | "failed" | "blocked";

export type AgentState = "running" | "idle" | "offline";

export type Agent = {
    name: string;
    version: string;
    model: string;
    tools: string[];
    state: AgentState;
};

export type DecisionCounts = {
    allowed: number;
    asked: number;
    blocked: number;
};

export type RunSummary = {
    id: string;
    rootAgent: string;
    agents: string[];
    status: RunStatus;
    startedAt: number;
    durationMs: number;
    steps: number;
    costUsd: number;
    decisions: DecisionCounts;
    untrusted: boolean;
};

export type ApprovalArg = {
    name: string;
    value: string;
    origins: Label[];
    generated?: boolean;
    // False for amounts and plain words, which are never traced on their own.
    traced?: boolean;
};

export type ApprovalRequest = {
    id: string;
    runId: string;
    stepId: string;
    agent: string;
    tool: string;
    args: ApprovalArg[];
    reason: string;
    openedAt: number;
    waiting: boolean;
};

export type IncidentCategory = "bad input" | "bad reasoning" | "bad handoff" | "broken tool" | "missing guard";
export type ReplayStatus = "confirmed" | "not confirmed" | "could not reproduce" | "running";

export type Incident = {
    id: string;
    runId: string;
    title: string;
    category: IncidentCategory;
    entryPoint: string;
    damage: string;
    entryAgent: string;
    damageAgent: string;
    replay: ReplayStatus;
    openedAt: number;
};

export type DecisionEvent = {
    at: number;
    agent: string;
    tool: string;
    guard: GuardType;
    outcome: Outcome;
    runId: string;
    detail: string;
};

export type GuardCoverage = {
    guarded: number;
    seen: number;
};

// A rule's rollout mode. Observe records "would block" or "would ask" and lets the call run.
export type GuardMode = "block" | "observe";

export type StepKind =
    "model_call" | "tool_call" | "guard_decision" | "message" | "handoff" | "approval" | "memory_read" | "memory_write";

// What an argument holds. Typed values and ID-like values are traced; amounts and words are not.
export type ValueKind = "iban" | "card" | "email" | "url" | "domain" | "path" | "id" | "amount" | "text";

// How a value matched an earlier appearance in the run.
export type ValueMatch = "exact" | "inside" | "host" | "domain";

export type ValueAppearance = {
    label: Label;
    stepId: string;
    agent: string;
    at: number;
    match: ValueMatch;
};

// Where a value appeared earlier in the run, first appearance first.
// A traced value with no appearances is model-generated.
export type ValueLabel = {
    kind: ValueKind;
    traced: boolean;
    generated: boolean;
    appearances: ValueAppearance[];
};

// One node on an approval's influence path or an incident's path, in time order.
export type PathNodeKind = "origin" | "agent" | "handoff" | "message" | "memory" | "call";
export type PathRole = "entry" | "carry" | "turning" | "damage";

export type PathNode = {
    kind: PathNodeKind;
    role: PathRole | null;
    title: string;
    detail: string;
    agent: string | null;
    runId: string;
    stepId: string | null;
    label: Label;
    at: number;
};

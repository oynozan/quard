import type { ColumnType, Generated } from "kysely";

// Postgres returns Date; we insert ISO strings or Dates
type Timestamp = ColumnType<Date, Date | string, Date | string>;
type DefaultTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
// jsonb comes back parsed and goes in as JSON text
type Json = ColumnType<unknown, string, string>;
type DefaultJson = ColumnType<unknown, string | undefined, string>;

export type ProjectsTable = {
    id: Generated<string>;
    name: string;
    retention_days: Generated<number>;
    created_at: DefaultTimestamp;
};

export type AgentKeysTable = {
    id: Generated<string>;
    project_id: string;
    name: string;
    prefix: string;
    key_hash: string;
    created_at: DefaultTimestamp;
    last_used_at: Timestamp | null;
    revoked_at: Timestamp | null;
};

export type RunsTable = {
    project_id: string;
    run_id: string;
    agent: string;
    origins: DefaultJson;
    started_at: Timestamp;
    last_event_at: Timestamp;
    ended_at: Timestamp | null;
    outcome: "completed" | "failed" | "blocked" | null;
    error: string | null;
    model_calls: Generated<number>;
    tool_calls: Generated<number>;
    blocked: Generated<number>;
    cost_usd: Generated<number>;
    cost_known: Generated<boolean>;
    influenced: Generated<boolean>;
    flagged: Generated<boolean>;
    degraded: Generated<boolean>;
};

export type StepsTable = {
    project_id: string;
    run_id: string;
    step_id: string;
    kind: "model_call" | "tool_call";
    agent: string;
    parent_step_id: string | null;
    name: string;
    call_id: string | null;
    status: string;
    influenced: Generated<boolean>;
    flagged: Generated<boolean>;
    at: Timestamp;
    duration_ms: Generated<number>;
    detail: DefaultJson;
};

export type EventsTable = {
    project_id: string;
    event_id: string;
    run_id: string;
    step_id: string | null;
    type: string;
    agent: string;
    at: Timestamp;
    degraded: Generated<boolean>;
    body: Json;
    received_at: DefaultTimestamp;
};

export type LabelsTable = {
    project_id: string;
    run_id: string;
    content_id: string;
    step_id: string;
    agent: string;
    origin: string;
    trust: "trusted" | "untrusted";
    sensitivity: "internal" | "public";
    flags: string[];
    keys: string[];
    at: Timestamp;
};

export type DecisionsTable = {
    project_id: string;
    event_id: string;
    run_id: string;
    step_id: string;
    agent: string;
    tool: string;
    guard: string;
    rule: string;
    decision: string;
    mode: "block" | "observe";
    enforced: boolean;
    reason: string | null;
    field: string | null;
    at: Timestamp;
};

export type Database = {
    projects: ProjectsTable;
    agent_keys: AgentKeysTable;
    runs: RunsTable;
    steps: StepsTable;
    events: EventsTable;
    labels: LabelsTable;
    decisions: DecisionsTable;
};

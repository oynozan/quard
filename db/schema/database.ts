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
    fleet_started_at: Timestamp | null;
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
    rules_hash: string | null;
    request_id: string | null;
};

export type ApprovalAnswerColumn = "once" | "always" | "deny";

export type ApprovalRequestsTable = {
    project_id: string;
    id: string;
    run_id: string;
    step_id: string;
    agent: string;
    tool: string;
    args_hash: string;
    // Null once decided
    args: ColumnType<unknown, string | null, string | null>;
    masked: Json;
    labels: DefaultJson;
    context: DefaultJson;
    reasons: DefaultJson;
    rules_hash: string | null;
    opened_at: DefaultTimestamp;
    answer: ApprovalAnswerColumn | null;
    decided_by: string | null;
    decided_at: Timestamp | null;
    used_by: string | null;
    used_at: Timestamp | null;
};

export type ApprovalWaitersTable = {
    project_id: string;
    ask_id: string;
    request_id: string;
    run_id: string;
    step_id: string;
    agent: string;
    since: DefaultTimestamp;
    last_beat_at: DefaultTimestamp;
    done_at: Timestamp | null;
};

export type ApprovalGrantsTable = {
    project_id: string;
    id: string;
    request_id: string;
    agent: string;
    tool: string;
    args_hash: string;
    masked: Json;
    approved_by: string;
    approved_at: DefaultTimestamp;
    times_used: Generated<number>;
    last_used_at: Timestamp | null;
    revoked_at: Timestamp | null;
    revoked_by: string | null;
};

export type DayCountersTable = {
    project_id: string;
    // A UTC day, "YYYY-MM-DD"
    day: ColumnType<Date, string, string>;
    tool: string;
    counter: string;
    used: Generated<number>;
};

export type FleetValuesTable = {
    project_id: string;
    key: string;
    kind: "iban" | "email" | "domain";
    field: string;
    first_seen_at: DefaultTimestamp;
    quarantined_at: Timestamp | null;
    observe: Generated<boolean>;
    known_at: Timestamp | null;
    known_by: string | null;
};

export type FleetUsesTable = {
    id: Generated<string>;
    project_id: string;
    key: string;
    run_id: string;
    agent: string;
    tool: string;
    blocked: boolean;
    at: DefaultTimestamp;
};

export type SdkConnectionsTable = {
    project_id: string;
    id: string;
    key_id: string;
    sdk: string;
    host: string;
    pid: number;
    rules_hash: string | null;
    connected_at: DefaultTimestamp;
    disconnected_at: Timestamp | null;
};

export type RuleSetsTable = {
    project_id: string;
    hash: string;
    rules: Json;
    first_seen_at: DefaultTimestamp;
    last_seen_at: DefaultTimestamp;
};

export type AgentVersionsTable = {
    project_id: string;
    agent: string;
    version: string;
    model: string;
    tools: string[];
    instructions: string | null;
    first_seen_at: DefaultTimestamp;
    last_seen_at: DefaultTimestamp;
};

export type MessageRecordsTable = {
    project_id: string;
    ref: string;
    run_id: string;
    step_id: string | null;
    sender: string;
    depth: number;
    print: string;
    label: Json;
    value_labels: DefaultJson;
    tools: string[] | null;
    stored_at: DefaultTimestamp;
};

export type MemoryLabelsTable = {
    project_id: string;
    print: string;
    label_hash: string;
    store: string;
    run_id: string;
    agent: string;
    trust: "trusted" | "untrusted";
    label: Json;
    value_labels: DefaultJson;
    first_written_at: DefaultTimestamp;
    last_written_at: DefaultTimestamp;
};

export type RunCountersTable = {
    project_id: string;
    run_id: string;
    counter: string;
    used: Generated<number>;
    updated_at: DefaultTimestamp;
};

export type AgentMessagesTable = {
    project_id: string;
    event_id: string;
    run_id: string;
    step_id: string;
    kind: "message" | "handoff" | "tool";
    from_agent: string;
    to_agent: string;
    parent_step_id: string | null;
    trust: "trusted" | "untrusted";
    sensitivity: "internal" | "public";
    verified: Generated<boolean>;
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
    approval_requests: ApprovalRequestsTable;
    approval_waiters: ApprovalWaitersTable;
    approval_grants: ApprovalGrantsTable;
    day_counters: DayCountersTable;
    fleet_values: FleetValuesTable;
    fleet_uses: FleetUsesTable;
    sdk_connections: SdkConnectionsTable;
    rule_sets: RuleSetsTable;
    agent_versions: AgentVersionsTable;
    message_records: MessageRecordsTable;
    memory_labels: MemoryLabelsTable;
    run_counters: RunCountersTable;
    agent_messages: AgentMessagesTable;
};

import type { ColumnType, Generated } from "kysely";

// The tables multi-agent runs add

type Timestamp = ColumnType<Date, Date | string, Date | string>;
type DefaultTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Json = ColumnType<unknown, string, string>;
type DefaultJson = ColumnType<unknown, string | undefined, string>;

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
    store: string;
    run_id: string;
    agent: string;
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

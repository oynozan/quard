import type { ColumnType, Generated } from "kysely";

type Timestamp = ColumnType<Date, Date | string, Date | string>;
type Json = ColumnType<unknown, string, string>;

export type FallbackState = "pending" | "done" | "skipped" | "failed";

// Chunks of public content a detector labeled, for the review queue
export type ChunkLabelsTable = {
    project_id: string;
    event_id: string;
    run_id: string;
    step_id: string;
    agent: string;
    tool: string;
    origin: string;
    detector: string;
    chunk: number;
    text: string;
    label: string;
    probabilities: Json;
    confidence: number;
    score: number;
    injection: number | null;
    at: Timestamp;
    reviewed_label: string | null;
    reviewed_by: string | null;
    reviewed_at: Timestamp | null;
    fallback_state: FallbackState | null;
    fallback_label: string | null;
    fallback_reason: string | null;
    fallback_model: string | null;
    fallback_cost_usd: number | null;
    fallback_error: string | null;
    attempts: Generated<number>;
    leased_until: Timestamp | null;
};

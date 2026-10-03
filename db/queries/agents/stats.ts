import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import { readUntrusted, startOf } from "./read.ts";

export type AgentStatsRow = {
    modelCalls: number;
    // Model calls that had read untrusted content
    influenced: number;
    costUsd: number;
    // False when a model call that answered has no known price
    costKnown: boolean;
    // Calls with an enforced ask, and calls with an enforced block
    asked: number;
    blocked: number;
};

// The agent's model calls, their cost and its guard results since `since`.
// Influence comes from labels: ingest never sets it on model calls.
export async function agentStats(
    db: Db,
    projectId: string,
    agent: string,
    window: { since: Date },
): Promise<AgentStatsRow> {
    const influenced = readUntrusted(projectId, sql.ref("s.run_id"), startOf("s"), sql.ref("s.step_id"));
    const [calls, checks] = await Promise.all([
        db
            .selectFrom("steps as s")
            .select([
                sql<number>`count(*)::int`.as("modelCalls"),
                sql<number>`(count(*) FILTER (WHERE ${influenced}))::int`.as("influenced"),
                sql<number>`coalesce(sum((s.detail->>'costUsd')::double precision), 0)`.as("costUsd"),
                // The refreshRuns rule: a failed call is not billed
                sql<boolean>`NOT coalesce(bool_or(s.status = 'ok' AND s.detail->>'costUsd' IS NULL), false)`.as(
                    "costKnown",
                ),
            ])
            .where("s.project_id", "=", projectId)
            .where("s.agent", "=", agent)
            .where("s.kind", "=", "model_call")
            .where("s.at", ">=", window.since)
            .executeTakeFirstOrThrow(),
        // One call can carry several decisions, so each call counts once
        db
            .selectFrom("decisions")
            .select([
                sql<number>`(count(DISTINCT (run_id, step_id)) FILTER (WHERE decision = 'ask'))::int`.as("asked"),
                sql<number>`(count(DISTINCT (run_id, step_id)) FILTER (WHERE decision = 'block'))::int`.as("blocked"),
            ])
            .where("project_id", "=", projectId)
            .where("agent", "=", agent)
            .where("enforced", "=", true)
            .where("at", ">=", window.since)
            .executeTakeFirstOrThrow(),
    ]);
    return { ...calls, ...checks };
}

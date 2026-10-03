import { sql } from "kysely";
import type { Db } from "../connect/connect.ts";

// An origin override the agents ran with, as run_started reported it.
// Null trust or sensitivity means the override left it at the default.
export type OriginOverrideRow = {
    origin: string;
    trust: "trusted" | "untrusted" | null;
    sensitivity: "internal" | "public" | null;
    // Agents whose runs set it, sorted
    agents: string[];
    // The start of the newest run that set it
    seenAt: Date;
};

// The overrides in the project's newest runs, one row per origin, sorted by origin.
// Each row keeps the override of the newest run that set it.
export async function originOverrides(
    db: Db,
    projectId: string,
    options: { limit: number },
): Promise<OriginOverrideRow[]> {
    const { rows } = await sql<OriginOverrideRow>`
        WITH recent AS (
            SELECT run_id, agent, started_at, origins
            FROM runs
            WHERE project_id = ${projectId}
            ORDER BY started_at DESC, run_id DESC
            LIMIT ${options.limit}
        ), entries AS (
            SELECT e.key AS origin, e.value AS override, r.run_id, r.agent, r.started_at
            FROM recent r
            CROSS JOIN LATERAL jsonb_each(
                CASE WHEN jsonb_typeof(r.origins) = 'object' THEN r.origins ELSE '{}'::jsonb END
            ) e
        )
        SELECT
            origin,
            (array_agg(override->>'trust' ORDER BY started_at DESC, run_id DESC))[1] AS trust,
            (array_agg(override->>'sensitivity' ORDER BY started_at DESC, run_id DESC))[1] AS sensitivity,
            array_agg(DISTINCT agent ORDER BY agent) AS agents,
            max(started_at) AS "seenAt"
        FROM entries
        GROUP BY origin
        ORDER BY origin
    `.execute(db);
    return rows;
}

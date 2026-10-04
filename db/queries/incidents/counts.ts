import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { Trust } from "./types.ts";

export type IncidentCounts = {
    bySource: { origin: string; trust: Trust; count: number }[];
    byTool: { tool: string; count: number }[];
    // How often an agent read the suspect content, and how often it made the bad call
    agentPoints: { agent: string; entry: number; turning: number }[];
};

const COUNT = sql<number>`count(*)::int`;

// Incidents with a verdict, opened since `since`, most first
export async function incidentCounts(db: Db, projectId: string, since: Date): Promise<IncidentCounts> {
    const found = db
        .selectFrom("incidents")
        .where("project_id", "=", projectId)
        .where("find_state", "=", "done")
        .where("opened_at", ">=", since);
    const [bySource, byTool, points] = await Promise.all([
        found
            .select(["entry_origin as origin", "entry_trust as trust", COUNT.as("count")])
            .$narrowType<{ origin: string; trust: Trust }>()
            .groupBy(["entry_origin", "entry_trust"])
            .orderBy("count", "desc")
            .orderBy("entry_origin")
            .orderBy("entry_trust")
            .execute(),
        found
            .select(["damage_tool as tool", COUNT.as("count")])
            .$narrowType<{ tool: string }>()
            .groupBy("damage_tool")
            .orderBy("count", "desc")
            .orderBy("damage_tool")
            .execute(),
        sql<IncidentCounts["agentPoints"][number]>`SELECT p.agent,
                count(*) FILTER (WHERE p.role = 'entry')::int AS entry,
                count(*) FILTER (WHERE p.role = 'turning')::int AS turning
            FROM incidents i, LATERAL (VALUES (i.entry_agent, 'entry'), (i.turning_agent, 'turning')) AS p (agent, role)
            WHERE i.project_id = ${projectId} AND i.find_state = 'done' AND i.opened_at >= ${since}
            GROUP BY p.agent
            ORDER BY count(*) DESC, p.agent`.execute(db),
    ]);
    return { bySource, byTool, agentPoints: points.rows };
}

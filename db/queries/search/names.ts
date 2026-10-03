import { sql, type SqlBool } from "kysely";
import type { Db } from "../../connect/connect.ts";

// The first step in a run that matched the name
export type NameMatchRow = {
    runId: string;
    stepId: string;
    agent: string;
    kind: "model_call" | "tool_call";
    // The model or tool name
    name: string;
    at: Date;
};

// There is one match per run, so total and runs are the same
export type NameSearch = { total: number; runs: number; matches: NameMatchRow[] };

// An agent name, a tool name, or both. Case does not matter.
export type NameQuery = ({ agent: string; tool?: string } | { agent?: string; tool: string }) & { limit: number };

function named(db: Db, projectId: string, { agent, tool }: NameQuery) {
    let query = db.selectFrom("steps").where("project_id", "=", projectId);
    if (agent !== undefined) {
        query = query.where(sql<SqlBool>`lower(agent) = lower(${agent})`);
    }
    if (tool !== undefined) {
        query = query.where("kind", "=", "tool_call").where(sql<SqlBool>`lower(name) = lower(${tool})`);
    }
    return query;
}

// Runs where the agent made a step, or where the tool was called. Newest first.
export async function findName(db: Db, projectId: string, options: NameQuery): Promise<NameSearch> {
    const first = named(db, projectId, options)
        .select(["run_id as runId", "step_id as stepId", "agent", "kind", "name", "at"])
        .distinctOn("run_id")
        .orderBy("run_id")
        .orderBy("at")
        .orderBy("step_id");
    const [counts, matches] = await Promise.all([
        named(db, projectId, options)
            .select(sql<number>`count(DISTINCT run_id)::int`.as("runs"))
            .executeTakeFirstOrThrow(),
        db
            .selectFrom(first.as("first"))
            .selectAll()
            .orderBy("at", "desc")
            .orderBy("runId")
            .limit(options.limit)
            .execute(),
    ]);
    return { total: counts.runs, runs: counts.runs, matches };
}

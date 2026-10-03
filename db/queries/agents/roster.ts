import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";

export type AgentRosterRow = {
    agent: string;
    // Its newest event, by the agent host's clock
    lastSeenAt: Date;
    // Runs it had an event in since dayAgo
    runs24h: number;
    // It had an event after idleSince in a run with no recorded end
    running: boolean;
    // The model of its newest model call since `since`
    model: string | null;
};

export type RosterWindow = { since: Date; dayAgo: Date; idleSince: Date };

// Agents with an event since `since`, by name. A run without a recorded end
// counts as running until it has been quiet a while (IDLE_MS in web).
export async function agentRoster(db: Db, projectId: string, window: RosterWindow): Promise<AgentRosterRow[]> {
    return db
        .selectFrom("events as e")
        .innerJoin("runs as r", (join) =>
            join.onRef("r.project_id", "=", "e.project_id").onRef("r.run_id", "=", "e.run_id"),
        )
        .select((eb) => [
            "e.agent",
            sql<Date>`max(e.at)`.as("lastSeenAt"),
            sql<number>`(count(DISTINCT e.run_id) FILTER (WHERE e.at >= ${window.dayAgo}))::int`.as("runs24h"),
            sql<boolean>`bool_or(r.outcome IS NULL AND e.at > ${window.idleSince})`.as("running"),
            eb
                .selectFrom("steps as s")
                .select("s.name")
                .where("s.project_id", "=", projectId)
                .whereRef("s.agent", "=", "e.agent")
                .where("s.kind", "=", "model_call")
                .where("s.at", ">=", window.since)
                .orderBy("s.at", "desc")
                .orderBy("s.step_id", "desc")
                .limit(1)
                .as("model"),
        ])
        .where("e.project_id", "=", projectId)
        .where("e.at", ">=", window.since)
        .groupBy("e.agent")
        .orderBy("e.agent")
        .execute();
}

// The agent's newest event of any time, or undefined when it has none.
// It has no window, so it also tells whether the agent exists.
export async function agentLastSeen(db: Db, projectId: string, agent: string): Promise<Date | undefined> {
    const row = await db
        .selectFrom("events")
        .select(sql<Date | null>`max(at)`.as("at"))
        .where("project_id", "=", projectId)
        .where("agent", "=", agent)
        .executeTakeFirstOrThrow();
    return row.at ?? undefined;
}

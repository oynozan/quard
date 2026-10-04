import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { LinksOptions } from "./links.ts";

export type AgentMessageRow = {
    from: string;
    to: string;
    // Messages that name the sender's step: work handed to another process
    delegations: number;
    // Handoffs and agents run as tools, from the OpenAI Agents SDK
    handoffs: number;
    // Other messages a receive guard took in
    messages: number;
    // Ones with untrusted content, or that no record vouched for
    untrusted: number;
    lastAt: Date;
};

// The sender of a message that no record vouched for
const UNKNOWN = "unknown";

// Messages and handoffs between agents from `since` on, per sender and
// receiver. A message that names the sender's step came through
// quard.resume(), so it counts as a delegation. When no record vouched for
// a message but it names a step of its run, that step's agent sent it.
export async function agentMessageLinks(db: Db, projectId: string, options: LinksOptions): Promise<AgentMessageRow[]> {
    const rows = db
        .selectFrom("agent_messages as m")
        .leftJoin("steps as p", (join) =>
            join
                .onRef("p.project_id", "=", "m.project_id")
                .onRef("p.run_id", "=", "m.run_id")
                .onRef("p.step_id", "=", "m.parent_step_id"),
        )
        .select([
            sql<string>`CASE WHEN m.from_agent = ${UNKNOWN} THEN coalesce(p.agent, m.from_agent) ELSE m.from_agent END`.as(
                "sender",
            ),
            "m.to_agent as receiver",
            "m.kind",
            sql<boolean>`(m.parent_step_id IS NOT NULL)`.as("delegated"),
            sql<boolean>`(m.trust = 'untrusted' OR NOT m.verified)`.as("untrusted"),
            "m.at",
        ])
        .where("m.project_id", "=", projectId)
        .where("m.at", ">=", options.since);
    let links = db
        .with("t", () => rows)
        .selectFrom("t")
        .select([
            "t.sender as from",
            "t.receiver as to",
            sql<number>`(count(*) FILTER (WHERE t.kind = 'message' AND t.delegated))::int`.as("delegations"),
            sql<number>`(count(*) FILTER (WHERE t.kind <> 'message'))::int`.as("handoffs"),
            sql<number>`(count(*) FILTER (WHERE t.kind = 'message' AND NOT t.delegated))::int`.as("messages"),
            sql<number>`(count(*) FILTER (WHERE t.untrusted))::int`.as("untrusted"),
            sql<Date>`max(t.at)`.as("lastAt"),
        ])
        .whereRef("t.sender", "<>", "t.receiver")
        .groupBy(["t.sender", "t.receiver"])
        .orderBy(sql`count(*)`, "desc")
        .orderBy("from")
        .orderBy("to");
    const agent = options.agent;
    if (agent !== undefined) {
        links = links.where((eb) => eb.or([eb("t.sender", "=", agent), eb("t.receiver", "=", agent)]));
    }
    return links.execute();
}

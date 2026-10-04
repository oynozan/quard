import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { LinksOptions } from "./links.ts";

export type AgentMessageRow = {
    from: string;
    to: string;
    // Handoffs and agents run as tools, from the OpenAI Agents SDK
    handoffs: number;
    // Messages a receive guard took in
    messages: number;
    // Delegations across processes among those messages: one per run and
    // sender's step named, however many messages name it
    delegated: number;
    // The messages that are delegations, each one counted
    delegatedMessages: number;
    // Ones with untrusted content, or that no record vouched for. A
    // delegation counts once, as in `delegated`.
    untrusted: number;
    lastAt: Date;
};

// A message that names a step another agent took in the same run came
// through quard.resume(), so it is also a delegation, as in agentLinks
const DELEGATION = sql<boolean>`(m.kind = 'message' AND coalesce(p.agent <> m.to_agent, false))`;

// The run and step that make one delegation, however many messages name it
const NAMED = sql`(t.run_id, t.parent_step_id)`;

// Messages and handoffs between agents from `since` on, per sender and
// receiver. A delegation is from the agent of the step it names, as in
// agentLinks, whoever a record vouched for. Any other message is from the
// sender it recorded.
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
            sql<string>`CASE WHEN ${DELEGATION} THEN p.agent ELSE m.from_agent END`.as("sender"),
            "m.to_agent as receiver",
            "m.kind",
            "m.run_id",
            "m.parent_step_id",
            DELEGATION.as("delegation"),
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
            sql<number>`(count(*) FILTER (WHERE t.kind <> 'message'))::int`.as("handoffs"),
            sql<number>`(count(*) FILTER (WHERE t.kind = 'message'))::int`.as("messages"),
            // Once per run and step, like a delegation made in one process
            sql<number>`(count(DISTINCT ${NAMED}) FILTER (WHERE t.delegation))::int`.as("delegated"),
            sql<number>`(count(*) FILTER (WHERE t.delegation))::int`.as("delegatedMessages"),
            sql<number>`(count(*) FILTER (WHERE t.untrusted AND NOT t.delegation)
                + count(DISTINCT ${NAMED}) FILTER (WHERE t.untrusted AND t.delegation))::int`.as("untrusted"),
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

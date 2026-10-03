import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import { readUntrusted, startOf } from "./read.ts";

export type AgentLinkRow = {
    from: string;
    to: string;
    // Times `from` handed work to `to`: one per run and parent step
    delegations: number;
    // Delegations whose first model call had read untrusted content
    untrusted: number;
    runs: number;
    // The newest model call of `to` in these delegations
    lastAt: Date;
};

export type LinksOptions = { since: Date; agent?: string };

// Delegations made with quard.agent(). Each model call of a child agent names
// the parent's step that started it. As on the run page (agentsOf in web
// live/detail.ts), the parent is the agent of that step, when it differs.
// A delegation counts when one of its model calls is at or after `since`.
export async function agentLinks(db: Db, projectId: string, options: LinksOptions): Promise<AgentLinkRow[]> {
    let calls = db
        .selectFrom("steps as c")
        .innerJoin("steps as p", (join) =>
            join
                .onRef("p.project_id", "=", "c.project_id")
                .onRef("p.run_id", "=", "c.run_id")
                .onRef("p.step_id", "=", "c.parent_step_id"),
        )
        .select([
            "c.run_id",
            "p.agent as parent",
            "c.agent as child",
            sql<Date>`max(c.at)`.as("last_at"),
            // The first call is the one that started first
            sql<Date>`min(${startOf("c")})`.as("first_start"),
            sql<string>`(array_agg(c.step_id ORDER BY ${startOf("c")}, c.step_id))[1]`.as("first_step"),
        ])
        .where("c.project_id", "=", projectId)
        .where("c.kind", "=", "model_call")
        .whereRef("p.agent", "<>", "c.agent")
        .groupBy(["c.run_id", "c.parent_step_id", "p.agent", "c.agent"])
        .having(sql<Date>`max(c.at)`, ">=", options.since);
    const agent = options.agent;
    if (agent !== undefined) {
        calls = calls.where((eb) => eb.or([eb("p.agent", "=", agent), eb("c.agent", "=", agent)]));
    }
    const untrusted = readUntrusted(projectId, sql.ref("d.run_id"), sql.ref("d.first_start"), sql.ref("d.first_step"));
    return db
        .with("d", () => calls)
        .selectFrom("d")
        .select([
            "d.parent as from",
            "d.child as to",
            sql<number>`count(*)::int`.as("delegations"),
            sql<number>`(count(*) FILTER (WHERE ${untrusted}))::int`.as("untrusted"),
            sql<number>`count(DISTINCT d.run_id)::int`.as("runs"),
            sql<Date>`max(d.last_at)`.as("lastAt"),
        ])
        .groupBy(["d.parent", "d.child"])
        .orderBy("delegations", "desc")
        .orderBy("from")
        .orderBy("to")
        .execute();
}

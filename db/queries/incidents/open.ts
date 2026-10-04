import { sql, type Insertable, type Transaction } from "kysely";
import type { Database, DecisionsTable } from "../../schema/database.ts";

// Opens an incident for each run where a guard blocked a call, enforced or
// only observed, at its earliest block. The id comes from the run, the same
// way the 0008 migration made it, so a run keeps its first incident.
export async function openIncidents(
    trx: Transaction<Database>,
    projectId: string,
    decisions: Insertable<DecisionsTable>[],
): Promise<void> {
    const blocks = decisions.filter((row) => row.decision === "block").map((row) => row.event_id);
    if (blocks.length === 0) {
        return;
    }
    await trx
        .insertInto("incidents")
        .columns(["project_id", "id", "run_id", "opened_at"])
        .expression(
            trx
                .selectFrom("decisions")
                .select([
                    "project_id",
                    sql<string>`'inc_' || left(md5(project_id::text || ':' || run_id), 16)`.as("id"),
                    "run_id",
                    (eb) => eb.fn.min("at").as("opened_at"),
                ])
                .where("project_id", "=", projectId)
                .where("event_id", "in", blocks)
                .groupBy(["project_id", "run_id"]),
        )
        .onConflict((conflict) => conflict.doNothing())
        .execute();
}

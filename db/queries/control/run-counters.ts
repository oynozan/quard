import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";

export type RunCountResult = { ok: boolean; used: number };

// Adds to a counter of one run, shared by every process in it: "steps",
// "cost", "calls:<tool>" or "amount:<tool>:<field>". With max it only adds
// while the total stays at or under it; the row lock makes two adds at
// the cap check the new total, as addDayCount does.
export async function addRunCount(
    db: Db,
    projectId: string,
    runId: string,
    counter: string,
    add: number,
    max?: number,
): Promise<RunCountResult> {
    if (max === undefined) {
        const row = await db
            .insertInto("run_counters")
            .values({ project_id: projectId, run_id: runId, counter, used: add })
            .onConflict((conflict) =>
                conflict.columns(["project_id", "run_id", "counter"]).doUpdateSet({
                    used: sql<number>`run_counters.used + excluded.used`,
                    updated_at: sql<Date>`now()`,
                }),
            )
            .returning("used")
            .executeTakeFirstOrThrow();
        return { ok: true, used: row.used };
    }
    // A fresh row whose add is already over the cap is never written
    const added = await sql<{ used: number }>`
        INSERT INTO run_counters (project_id, run_id, counter, used)
        SELECT ${projectId}::uuid, ${runId}, ${counter}, ${add}::float8
        WHERE ${add}::float8 <= ${max}::float8
        ON CONFLICT (project_id, run_id, counter)
        DO UPDATE SET used = run_counters.used + excluded.used, updated_at = now()
        WHERE run_counters.used + excluded.used <= ${max}::float8
        RETURNING used`.execute(db);
    const row = added.rows[0];
    if (row !== undefined) {
        return { ok: true, used: row.used };
    }
    const current = await db
        .selectFrom("run_counters")
        .select("used")
        .where("project_id", "=", projectId)
        .where("run_id", "=", runId)
        .where("counter", "=", counter)
        .executeTakeFirst();
    return { ok: false, used: current?.used ?? 0 };
}

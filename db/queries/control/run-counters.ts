import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";

// One addition to a counter of a run: "steps", "cost", "calls:<tool>" or
// "amount:<tool>:<field>". With max it only adds while the total stays
// at or under it.
export type RunCountInput = { counter: string; add: number; max?: number | undefined };

export type RunCountsResult = { ok: boolean; used: number[] };

// Thrown inside the transaction to undo it, with the totals as they stay
class Refused extends Error {
    readonly used: number[];

    constructor(used: number[]) {
        super("refused");
        this.used = used;
    }
}

// Locks the run's rows for these counters, in counter order so two calls
// can't deadlock, and returns their totals. Missing rows are made first
// so they can be locked too.
async function lockTotals(db: Db, projectId: string, runId: string, counters: string[]): Promise<Map<string, number>> {
    const names = [...new Set(counters)].sort();
    await db
        .insertInto("run_counters")
        .values(names.map((counter) => ({ project_id: projectId, run_id: runId, counter, used: 0 })))
        .onConflict((conflict) => conflict.doNothing())
        .execute();
    const rows = await db
        .selectFrom("run_counters")
        .select(["counter", "used"])
        .where("project_id", "=", projectId)
        .where("run_id", "=", runId)
        .where("counter", "in", names)
        .orderBy("counter")
        .forUpdate()
        .execute();
    return new Map(rows.map((row) => [row.counter, row.used]));
}

async function addOne(db: Db, projectId: string, runId: string, counter: string, add: number): Promise<number> {
    const row = await db
        .updateTable("run_counters")
        .set({ used: sql<number>`used + ${add}::float8`, updated_at: sql<Date>`now()` })
        .where("project_id", "=", projectId)
        .where("run_id", "=", runId)
        .where("counter", "=", counter)
        .returning("used")
        .executeTakeFirstOrThrow();
    return row.used;
}

// Adds to one or more counters of one run, shared by every process in
// it: all of them, or none when one would pass its max. Returns each
// counter's total in the order given, after the adds or as it stays.
export async function addRunCounts(
    db: Db,
    projectId: string,
    runId: string,
    counts: readonly RunCountInput[],
): Promise<RunCountsResult> {
    try {
        return await db.transaction().execute(async (trx) => {
            const before = await lockTotals(
                trx,
                projectId,
                runId,
                counts.map((count) => count.counter),
            );
            const totals = new Map(before);
            const fits = counts.every(({ counter, add, max }) => {
                const total = (totals.get(counter) as number) + add;
                totals.set(counter, total);
                return total <= (max ?? Infinity);
            });
            if (!fits) {
                // Undoes the rows made only to lock them
                throw new Refused(counts.map((count) => before.get(count.counter) as number));
            }
            const used: number[] = [];
            for (const { counter, add } of counts) {
                used.push(await addOne(trx, projectId, runId, counter, add));
            }
            return { ok: true, used };
        });
    } catch (error) {
        if (error instanceof Refused) {
            return { ok: false, used: error.used };
        }
        throw error;
    }
}

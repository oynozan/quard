import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";

// The counters of one tool on one UTC day "YYYY-MM-DD"
export type DayKey = { day: string; tool: string };

// One addition to "calls" or "amount:<field>", only made while the total stays at or under max
export type DayCountInput = { counter: string; add: number; max?: number | undefined };

export type DayCountsResult = { ok: boolean; used: number[] };

export type DayCount = { tool: string; counter: string; day: string; used: number };

// The column reads back as a Date, so a day is compared as a date value
const dateOf = (day: string) => sql<Date>`${day}::date`;

// Thrown inside the transaction to undo it, with the totals as they stay
class Refused extends Error {
    readonly used: number[];

    constructor(used: number[]) {
        super("refused");
        this.used = used;
    }
}

// Locks the rows in counter order so two calls can't deadlock, making missing ones first
async function lockTotals(db: Db, projectId: string, key: DayKey, counters: string[]): Promise<Map<string, number>> {
    const names = [...new Set(counters)].sort();
    await db
        .insertInto("day_counters")
        .values(names.map((counter) => ({ project_id: projectId, day: key.day, tool: key.tool, counter, used: 0 })))
        .onConflict((conflict) => conflict.doNothing())
        .execute();
    const rows = await db
        .selectFrom("day_counters")
        .select(["counter", "used"])
        .where("project_id", "=", projectId)
        .where("day", "=", dateOf(key.day))
        .where("tool", "=", key.tool)
        .where("counter", "in", names)
        .orderBy("counter")
        .forUpdate()
        .execute();
    return new Map(rows.map((row) => [row.counter, row.used]));
}

async function addOne(db: Db, projectId: string, key: DayKey, counter: string, add: number): Promise<number> {
    const row = await db
        .updateTable("day_counters")
        .set({ used: sql<number>`used + ${add}::float8` })
        .where("project_id", "=", projectId)
        .where("day", "=", dateOf(key.day))
        .where("tool", "=", key.tool)
        .where("counter", "=", counter)
        .returning("used")
        .executeTakeFirstOrThrow();
    return row.used;
}

// Adds one call to the project's counters, all of them or none, and returns each total in order
export async function addDayCounts(
    db: Db,
    projectId: string,
    key: DayKey,
    counts: readonly DayCountInput[],
): Promise<DayCountsResult> {
    try {
        return await db.transaction().execute(async (trx) => {
            const before = await lockTotals(
                trx,
                projectId,
                key,
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
                used.push(await addOne(trx, projectId, key, counter, add));
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

// Every counter of one UTC day in the project
export async function dayCounts(db: Db, projectId: string, day: string): Promise<DayCount[]> {
    return db
        .selectFrom("day_counters")
        .select(["tool", "counter", sql<string>`to_char(day, 'YYYY-MM-DD')`.as("day"), "used"])
        .where("project_id", "=", projectId)
        .where("day", "=", dateOf(day))
        .orderBy("tool")
        .orderBy("counter")
        .execute();
}

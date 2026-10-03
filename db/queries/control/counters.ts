import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";

// One per-day counter: a UTC day "YYYY-MM-DD", and "calls" or "amount:<field>"
export type DayCountInput = { day: string; tool: string; counter: string; add: number; max?: number };

export type DayCountResult = { ok: boolean; used: number };

export type DayCount = { tool: string; counter: string; day: string; used: number };

// The column reads back as a Date, so a day is compared as a date value
const dateOf = (day: string) => sql<Date>`${day}::date`;

// Adds to a counter shared by every process in the project. With max it only
// adds while the total stays at or under it, so two adds at the cap never
// both pass: the row lock makes the second one check the new total.
export async function addDayCount(db: Db, projectId: string, input: DayCountInput): Promise<DayCountResult> {
    if (input.max === undefined) {
        const row = await db
            .insertInto("day_counters")
            .values({
                project_id: projectId,
                day: input.day,
                tool: input.tool,
                counter: input.counter,
                used: input.add,
            })
            .onConflict((conflict) =>
                conflict
                    .columns(["project_id", "day", "tool", "counter"])
                    .doUpdateSet({ used: sql<number>`day_counters.used + excluded.used` }),
            )
            .returning("used")
            .executeTakeFirstOrThrow();
        return { ok: true, used: row.used };
    }
    const max = input.max;
    // A fresh row whose add is already over the cap is never written
    const added = await sql<{ used: number }>`
        INSERT INTO day_counters (project_id, day, tool, counter, used)
        SELECT ${projectId}::uuid, ${input.day}::date, ${input.tool}, ${input.counter}, ${input.add}::float8
        WHERE ${input.add}::float8 <= ${max}::float8
        ON CONFLICT (project_id, day, tool, counter)
        DO UPDATE SET used = day_counters.used + excluded.used
        WHERE day_counters.used + excluded.used <= ${max}::float8
        RETURNING used`.execute(db);
    const row = added.rows[0];
    if (row !== undefined) {
        return { ok: true, used: row.used };
    }
    const current = await db
        .selectFrom("day_counters")
        .select("used")
        .where("project_id", "=", projectId)
        .where("day", "=", dateOf(input.day))
        .where("tool", "=", input.tool)
        .where("counter", "=", input.counter)
        .executeTakeFirst();
    return { ok: false, used: current?.used ?? 0 };
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

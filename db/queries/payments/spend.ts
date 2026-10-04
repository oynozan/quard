import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import { slotOf, type TimeRange } from "../activity.ts";

const DAY = 86_400_000;

// Settled payments are spend. usd sums the ones with a known USD value.
export type SpendTotal = {
    usd: number;
    payments: number;
    // Settled payments in tokens with no known USD value
    unknown: number;
};

// Day 0 starts at since
export type SpendDay = SpendTotal & { day: number };

export type SpendGroup = SpendTotal & { key: string };

export type SpendBy = "agent" | "host" | "payTo";

const COLUMN = { agent: "agent", host: "host", payTo: "pay_to" } as const;

const TOTALS = [
    sql<number>`coalesce(sum(usd), 0)::float8`.as("usd"),
    sql<number>`count(*)::int`.as("payments"),
    sql<number>`(count(*) FILTER (WHERE usd IS NULL))::int`.as("unknown"),
] as const;

function settled(db: Db, projectId: string, range: TimeRange) {
    return db
        .selectFrom("payments")
        .where("project_id", "=", projectId)
        .where("stage", "=", "settled")
        .where("at", ">=", range.since)
        .where("at", "<", range.until);
}

// Spend per day, oldest first. Days with no settled payment are left out.
export async function spendByDay(db: Db, projectId: string, range: TimeRange): Promise<SpendDay[]> {
    return settled(db, projectId, range)
        .select([slotOf("at", range.since.getTime(), DAY).as("day"), ...TOTALS])
        .groupBy("day")
        .orderBy("day")
        .execute();
}

// Spend per agent, host or payee, biggest first
export async function spendBy(db: Db, projectId: string, by: SpendBy, range: TimeRange): Promise<SpendGroup[]> {
    const column = COLUMN[by];
    return settled(db, projectId, range)
        .select([sql.ref<string>(column).as("key"), ...TOTALS])
        .groupBy(column)
        .orderBy("usd", "desc")
        .orderBy("payments", "desc")
        .orderBy("key")
        .execute();
}

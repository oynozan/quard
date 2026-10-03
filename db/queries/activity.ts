import { sql, type RawBuilder } from "kysely";
import type { Db } from "../connect/connect.ts";

// From since, which is kept, up to until, which is left out
export type TimeRange = { since: Date; until: Date };

export type BucketRange = TimeRange & { bucketMs: number };

// Bucket 0 starts at since, and empty buckets are left out
export type BucketCount = { bucket: number; count: number };

// Whole sizes from origin to a time column, in epoch ms, so the session time zone never matters
export function slotOf(column: string, origin: number, size: number): RawBuilder<number> {
    return sql<number>`floor((extract(epoch from ${sql.ref(column)}) * 1000 - ${origin}) / ${size})::int`;
}

// Model calls by the time they finished, oldest bucket first
export async function modelCallBuckets(
    db: Db,
    projectId: string,
    range: BucketRange & { agent?: string },
): Promise<BucketCount[]> {
    let query = db
        .selectFrom("steps")
        .select([
            slotOf("at", range.since.getTime(), range.bucketMs).as("bucket"),
            sql<number>`count(*)::int`.as("count"),
        ])
        .where("project_id", "=", projectId)
        .where("kind", "=", "model_call")
        .where("at", ">=", range.since)
        .where("at", "<", range.until);
    if (range.agent !== undefined) {
        query = query.where("agent", "=", range.agent);
    }
    return query.groupBy("bucket").orderBy("bucket").execute();
}

// Runs by start time, oldest bucket first
export async function runStartBuckets(db: Db, projectId: string, range: BucketRange): Promise<BucketCount[]> {
    return db
        .selectFrom("runs")
        .select([
            slotOf("started_at", range.since.getTime(), range.bucketMs).as("bucket"),
            sql<number>`count(*)::int`.as("count"),
        ])
        .where("project_id", "=", projectId)
        .where("started_at", ">=", range.since)
        .where("started_at", "<", range.until)
        .groupBy("bucket")
        .orderBy("bucket")
        .execute();
}

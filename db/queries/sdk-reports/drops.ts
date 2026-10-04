import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";

export type DroppedEvents = { count: number; lastAt: Date | null };

// Notes events an SDK dropped, from a full buffer or as unsendable.
// The batch id (its first event id) keeps a resend from counting twice.
export async function recordDropped(
    db: Db,
    projectId: string,
    batchId: string,
    count: number,
    at: Date,
): Promise<void> {
    if (count === 0) {
        return;
    }
    await db
        .insertInto("upload_drops")
        .values({ project_id: projectId, batch_id: batchId, count, at })
        .onConflict((conflict) => conflict.doNothing())
        .execute();
}

// How many events SDKs reported dropped since `since`, and when the last were
export async function droppedEvents(db: Db, projectId: string, since: Date): Promise<DroppedEvents> {
    return db
        .selectFrom("upload_drops")
        .select([sql<number>`coalesce(sum(count), 0)::int`.as("count"), sql<Date | null>`max(at)`.as("lastAt")])
        .where("project_id", "=", projectId)
        .where("at", ">=", since)
        .executeTakeFirstOrThrow();
}

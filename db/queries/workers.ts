import { sql } from "kysely";
import type { Db } from "../connect/connect.ts";

// A running worker process, with an id new to each process
export type WorkerInfo = { id: string; host: string; pid: number; startedAt: Date };

// Records that the worker is running, and forgets workers gone for over a day
export async function beatWorker(db: Db, worker: WorkerInfo): Promise<void> {
    await db
        .insertInto("workers")
        .values({
            id: worker.id,
            host: worker.host,
            pid: worker.pid,
            started_at: worker.startedAt,
            seen_at: sql<Date>`now()`,
        })
        .onConflict((conflict) => conflict.column("id").doUpdateSet({ seen_at: sql<Date>`now()` }))
        .execute();
    await db
        .deleteFrom("workers")
        .where("seen_at", "<", sql<Date>`now() - interval '1 day'`)
        .execute();
}

// When any worker last checked in, or null when none is on record
export async function lastWorkerSeen(db: Db): Promise<Date | null> {
    const row = await db
        .selectFrom("workers")
        .select(sql<Date | null>`max(seen_at)`.as("seenAt"))
        .executeTakeFirstOrThrow();
    return row.seenAt;
}

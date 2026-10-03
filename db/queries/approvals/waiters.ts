import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { ApprovalWaiterInput } from "./types.ts";

// A call waiting on a request. Asked again, for example after a reconnect or
// when another call used an "approve once", it waits again and keeps `since`.
export async function addWaiter(db: Db, projectId: string, waiter: ApprovalWaiterInput): Promise<void> {
    await db
        .insertInto("approval_waiters")
        .values({
            project_id: projectId,
            ask_id: waiter.askId,
            request_id: waiter.requestId,
            run_id: waiter.runId,
            step_id: waiter.stepId,
            agent: waiter.agent,
        })
        .onConflict((conflict) =>
            conflict.columns(["project_id", "ask_id"]).doUpdateSet((eb) => ({
                request_id: eb.ref("excluded.request_id"),
                run_id: eb.ref("excluded.run_id"),
                step_id: eb.ref("excluded.step_id"),
                agent: eb.ref("excluded.agent"),
                last_beat_at: sql<Date>`now()`,
                done_at: null,
            })),
        )
        .execute();
}

// Heartbeats from calls still waiting. Returns how many were noted.
export async function beatWaiters(db: Db, projectId: string, askIds: string[]): Promise<number> {
    const result = await db
        .updateTable("approval_waiters")
        .set({ last_beat_at: sql<Date>`now()` })
        .where("project_id", "=", projectId)
        .where(sql<boolean>`ask_id = any(${askIds})`)
        .where("done_at", "is", null)
        .executeTakeFirst();
    return Number(result.numUpdatedRows);
}

// Calls that got their answer or stopped waiting. Returns how many changed.
export async function finishWaiters(db: Db, projectId: string, askIds: string[]): Promise<number> {
    const result = await db
        .updateTable("approval_waiters")
        .set({ done_at: sql<Date>`now()` })
        .where("project_id", "=", projectId)
        .where(sql<boolean>`ask_id = any(${askIds})`)
        .where("done_at", "is", null)
        .executeTakeFirst();
    return Number(result.numUpdatedRows);
}

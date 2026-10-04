import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { RunWaiter } from "./types.ts";

// A call's tool_call is stored only after it stopped waiting
const NOT_RECORDED = sql<boolean>`NOT EXISTS (
    SELECT 1 FROM steps s WHERE s.project_id = w.project_id AND s.run_id = w.run_id AND s.step_id = w.step_id
)`;

// Calls on open requests that have not stopped waiting, quiet ones included
function openWaiters(db: Db, projectId: string) {
    return db
        .selectFrom("approval_waiters as w")
        .innerJoin("approval_requests as r", (join) =>
            join.onRef("r.project_id", "=", "w.project_id").onRef("r.id", "=", "w.request_id"),
        )
        .where("w.project_id", "=", projectId)
        .where("w.done_at", "is", null)
        .where("r.answer", "is", null)
        .where(NOT_RECORDED);
}

// Calls of these runs on open requests, oldest first, quiet ones included
export async function runWaiters(db: Db, projectId: string, runIds: string[]): Promise<RunWaiter[]> {
    if (runIds.length === 0) {
        return [];
    }
    return openWaiters(db, projectId)
        .select([
            "w.ask_id as askId",
            "w.request_id as requestId",
            "w.run_id as runId",
            "w.step_id as stepId",
            "w.agent",
            "r.tool",
            "r.args_hash as argsHash",
            "w.since",
            "w.last_beat_at as lastBeatAt",
            "w.done_at as doneAt",
        ])
        .where(sql<boolean>`w.run_id = any(${runIds})`)
        .orderBy("w.since")
        .orderBy("w.ask_id")
        .execute();
}

// A subquery for the runs with a call on an open request that beat at or after `since`
export function beatingRuns(db: Db, projectId: string, since: Date) {
    return openWaiters(db, projectId).select("w.run_id").where("w.last_beat_at", ">=", since);
}

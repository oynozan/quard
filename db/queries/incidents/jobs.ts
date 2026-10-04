import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { ClaimedJob, ReplayState, StoredReplay, StoredVerdict } from "./types.ts";

// The verdict comes first, then a requested replay
const REPLAY_NEXT = sql`find_state = 'done'`;
const JOB = sql<ClaimedJob["job"]>`CASE WHEN find_state = 'pending' THEN 'find' ELSE 'replay' END`;

// A row is due when its time came, no live lease holds it and it has a job.
// A running replay is only due again once its lease ran out (a crashed worker).
const DUE = sql`run_after <= now() AND (leased_until IS NULL OR leased_until < now()) AND (
    find_state = 'pending'
    OR (find_state = 'done' AND replay_state IN ('requested', 'running')))`;

// A time ms milliseconds from now
export function fromNow(ms: number) {
    return sql<Date>`now() + ${ms}::double precision * interval '1 millisecond'`;
}

// Leases the incident whose job waited longest. SKIP LOCKED lets workers claim side by side.
export async function claimIncidentJob(db: Db, leaseMs: number): Promise<ClaimedJob | undefined> {
    return db
        .updateTable("incidents")
        .set({
            leased_until: fromNow(leaseMs),
            attempts: sql<number>`attempts + 1`,
            replay_state: sql<ReplayState>`CASE WHEN ${REPLAY_NEXT} THEN 'running' ELSE replay_state END`,
        })
        .where(
            sql<boolean>`(project_id, id) = (SELECT project_id, id FROM incidents WHERE ${DUE}
                ORDER BY run_after LIMIT 1 FOR UPDATE SKIP LOCKED)`,
        )
        .returning([
            "project_id as projectId",
            "id",
            "run_id as runId",
            JOB.as("job"),
            "attempts",
            "spent_usd as spentUsd",
            "cap_usd as capUsd",
            "verdict",
            "replay",
        ])
        .$narrowType<{ verdict: StoredVerdict | null; replay: StoredReplay | null }>()
        .executeTakeFirst();
}

// Gives the job back, to be claimed again after the delay
export async function deferIncidentJob(db: Db, projectId: string, id: string, delayMs: number): Promise<void> {
    await db
        .updateTable("incidents")
        .set({ leased_until: null, run_after: fromNow(delayMs) })
        .where("project_id", "=", projectId)
        .where("id", "=", id)
        .execute();
}

// The job threw. Returns the delay before it runs again, or null when none is left and it failed
export async function retryIncidentJob(
    db: Db,
    job: Pick<ClaimedJob, "projectId" | "id" | "job">,
    error: string,
    delaysMs: number[],
): Promise<number | null> {
    return db.transaction().execute(async (trx) => {
        const { errors } = await trx
            .selectFrom("incidents")
            .select("errors")
            .where("project_id", "=", job.projectId)
            .where("id", "=", job.id)
            .forUpdate()
            .executeTakeFirstOrThrow();
        const delayMs = delaysMs[errors];
        const failed =
            job.job === "find"
                ? { find_state: "failed" as const, find_error: error }
                : {
                      replay_state: "failed" as const,
                      // No outcome, as after any failed replay, so it can be asked for again
                      replay: sql<string>`replay || jsonb_build_object('outcome', null, 'error', ${error}::text)`,
                  };
        await trx
            .updateTable("incidents")
            .set(
                delayMs === undefined
                    ? { ...failed, errors: 0, attempts: 0, leased_until: null }
                    : { errors: errors + 1, leased_until: null, run_after: fromNow(delayMs) },
            )
            .where("project_id", "=", job.projectId)
            .where("id", "=", job.id)
            .execute();
        return delayMs ?? null;
    });
}

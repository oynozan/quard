import { claimIncidentJob, retryIncidentJob, type ClaimedJob, type Db } from "@quard/db";
import { messageOf, type JobDeps } from "../jobs/deps.ts";
import { runFind } from "../jobs/find.ts";
import { runReplayJob } from "../jobs/replay.ts";

// How long a claimed job stays the worker's. A crashed worker's job is
// claimed again once it runs out.
export const LEASE_MS = 10 * 60_000;

// A job that throws runs again after each of these, and fails on the next error
export const RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000];

const JOBS: Record<ClaimedJob["job"], (deps: JobDeps, job: ClaimedJob) => Promise<string>> = {
    find: runFind,
    replay: runReplayJob,
};

// Saves the error, or leaves the job to its lease when even that fails
async function threw(db: Db, job: ClaimedJob, error: string): Promise<string> {
    try {
        const delayMs = await retryIncidentJob(db, job, error, RETRY_DELAYS_MS);
        return delayMs === null
            ? `failed after ${RETRY_DELAYS_MS.length + 1} errors in a row: ${error}`
            : `failed: ${error}; trying again in ${delayMs / 1000} s`;
    } catch (saveError) {
        return `failed: ${error}; could not save the error: ${messageOf(saveError)}`;
    }
}

// Claims the job that waited longest and runs it. Returns a line for the
// log, or undefined when no job is due.
export async function runNextJob(deps: JobDeps): Promise<string | undefined> {
    const job = await claimIncidentJob(deps.db, LEASE_MS);
    if (job === undefined) {
        return undefined;
    }
    const result = await JOBS[job.job](deps, job).catch((error: unknown) => threw(deps.db, job, messageOf(error)));
    return `${job.job} ${job.id}: ${result}`;
}

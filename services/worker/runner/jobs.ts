import { claimIncidentJob, type ClaimedJob } from "@quard/db";
import { messageOf, type JobDeps } from "../jobs/deps.ts";
import { runFind } from "../jobs/find.ts";
import { runReplayJob } from "../jobs/replay.ts";
import { runReview } from "../jobs/review.ts";

// How long a claimed job stays the worker's. A crashed worker's job is
// claimed again once it runs out.
export const LEASE_MS = 10 * 60_000;

const JOBS: Record<ClaimedJob["job"], (deps: JobDeps, job: ClaimedJob) => Promise<string>> = {
    find: runFind,
    review: runReview,
    replay: runReplayJob,
};

// Claims the job that waited longest and runs it. Returns a line for the
// log, or undefined when no job is due.
export async function runNextJob(deps: JobDeps): Promise<string | undefined> {
    const job = await claimIncidentJob(deps.db, LEASE_MS);
    if (job === undefined) {
        return undefined;
    }
    // A job that throws is claimed again when its lease runs out
    const result = await JOBS[job.job](deps, job).catch((error: unknown) => `failed: ${messageOf(error)}`);
    return `${job.job} ${job.id}: ${result}`;
}

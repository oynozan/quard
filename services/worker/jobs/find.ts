import { deferIncidentJob, failFind, getRun, saveVerdict, type ClaimedJob } from "@quard/db";
import { damageOf, NEVER_ARRIVED } from "../rootcause/damage.ts";
import { verdictOf } from "../rootcause/verdict.ts";
import type { JobDeps } from "./deps.ts";

// Events can arrive after the decision that opened the incident
export const RETRY_MS = 5_000;
export const WAIT_MS = 5 * 60_000;

// Finds the incident's verdict, or waits for the run's events while it may still send them
export async function runFind(deps: JobDeps, job: ClaimedJob): Promise<string> {
    const { db } = deps;
    const run = await getRun(db, job.projectId, job.runId);
    const damage = run === undefined ? NEVER_ARRIVED : damageOf(run);
    if (typeof damage !== "string") {
        const verdict = verdictOf(damage.run, damage.step);
        await saveVerdict(db, job.projectId, job.id, verdict);
        return `verdict: ${verdict.category}`;
    }
    // A run that reported its end sends no more events
    if (run?.endedAt || job.attempts * RETRY_MS >= WAIT_MS) {
        await failFind(db, job.projectId, job.id, damage);
        return `failed: ${damage}`;
    }
    await deferIncidentJob(db, job.projectId, job.id, RETRY_MS);
    return "waiting for the run's events";
}

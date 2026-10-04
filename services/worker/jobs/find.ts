import { deferIncidentJob, failFind, getAgentMessages, getRun, saveVerdict, type ClaimedJob } from "@quard/db";
import type { StoredRun } from "../rootcause/run.ts";
import { findVerdict } from "../rootcause/verdict.ts";
import type { JobDeps } from "./deps.ts";

// Events can arrive after the decision that opened the incident
export const RETRY_MS = 5_000;
export const WAIT_MS = 5 * 60_000;
export const NEVER_ARRIVED = "The blocked call's events never arrived";

// The run's first tool call that a guard blocked, or would have in observe mode
function damageOf(run: StoredRun): string | undefined {
    const blocked = new Set(run.decisions.filter((item) => item.decision === "block").map((item) => item.stepId));
    return run.steps.find(
        (step) => step.kind === "tool_call" && (step.status === "blocked" || blocked.has(step.stepId)),
    )?.stepId;
}

// Finds the incident's verdict, or waits for the run's events to arrive
export async function runFind(deps: JobDeps, job: ClaimedJob): Promise<string> {
    const { db } = deps;
    const found = await getRun(db, job.projectId, job.runId);
    const run = found && { ...found, messages: await getAgentMessages(db, job.projectId, job.runId) };
    const damage = run && damageOf(run);
    const verdict = damage === undefined ? undefined : findVerdict(run as StoredRun, damage);
    if (verdict !== undefined) {
        await saveVerdict(db, job.projectId, job.id, verdict);
        return `verdict: ${verdict.category}`;
    }
    if (job.attempts * RETRY_MS >= WAIT_MS) {
        await failFind(db, job.projectId, job.id, NEVER_ARRIVED);
        return `failed: ${NEVER_ARRIVED}`;
    }
    await deferIncidentJob(db, job.projectId, job.id, RETRY_MS);
    return "waiting for the run's events";
}

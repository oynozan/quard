import {
    deferIncidentJob,
    failFind,
    getAgentMessages,
    getRun,
    isDetection,
    saveVerdict,
    type ClaimedJob,
    type DamageKind,
} from "@quard/db";
import type { StoredRun } from "../rootcause/run.ts";
import { findVerdict } from "../rootcause/verdict.ts";
import type { JobDeps } from "./deps.ts";

// Events can arrive after the decision that opened the incident
export const RETRY_MS = 5_000;
export const WAIT_MS = 5 * 60_000;
export const NEVER_ARRIVED = "The damaging call's events never arrived";

// The run limits that stop a model call (packages/sdk/guards/limit/model-limits.ts)
const RUN_LIMITS = new Set(["max-steps", "max-cost"]);

type Damage = { stepId: string; kind?: DamageKind };

// The run's first tool call that a guard blocked, or would have in observe
// mode. Else, once the run ended or waited long enough, the first tool call
// whose content a guard flagged or stripped, else the model call a run limit
// stopped. Waiting lets a blocked call later in the run win.
function damageOf(run: StoredRun & { endedAt: Date | null }, waited: boolean): Damage | undefined {
    const blocked = new Set(run.decisions.filter((item) => item.decision === "block").map((item) => item.stepId));
    const tools = run.steps.filter((step) => step.kind === "tool_call");
    const block = tools.find((step) => step.status === "blocked" || blocked.has(step.stepId));
    if (block !== undefined) {
        return { stepId: block.stepId };
    }
    if (run.endedAt === null && !waited) {
        return undefined;
    }
    const detected = new Set(run.decisions.filter(isDetection).map((item) => item.stepId));
    const found = tools.find((step) => detected.has(step.stepId));
    if (found !== undefined) {
        return { stepId: found.stepId, kind: "detection" };
    }
    const stop = run.decisions.find(
        (item) => item.guard === "limit" && item.decision === "block" && RUN_LIMITS.has(item.rule),
    );
    return stop && { stepId: stop.stepId, kind: "limit" };
}

// Finds the incident's verdict, or waits for the run's events to arrive
export async function runFind(deps: JobDeps, job: ClaimedJob): Promise<string> {
    const { db } = deps;
    const waited = job.attempts * RETRY_MS >= WAIT_MS;
    const found = await getRun(db, job.projectId, job.runId);
    const run = found && { ...found, messages: await getAgentMessages(db, job.projectId, job.runId) };
    const damage = run && damageOf(run, waited);
    const verdict = damage === undefined ? undefined : findVerdict(run as StoredRun, damage.stepId, damage.kind);
    if (verdict !== undefined) {
        await saveVerdict(db, job.projectId, job.id, verdict);
        return `verdict: ${verdict.category}`;
    }
    if (waited) {
        await failFind(db, job.projectId, job.id, NEVER_ARRIVED);
        return `failed: ${NEVER_ARRIVED}`;
    }
    await deferIncidentJob(db, job.projectId, job.id, RETRY_MS);
    return "waiting for the run's events";
}

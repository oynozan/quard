import { getModelCalls, getRun, saveReplay, type ClaimedJob, type StoredReplay } from "@quard/db";
import { callModel } from "../openai/call.ts";
import { isHarmful } from "../replay/harmful.ts";
import { planReplay } from "../replay/plan.ts";
import { runReplay, type Rerun } from "../replay/rounds.ts";
import type { StoredRun } from "../rootcause/run.ts";
import type { JobDeps } from "./deps.ts";

export const NO_KEY = "Set OPENAI_API_KEY on the worker to run replay";

// Reruns the turning point with and without the suspect content
// (PROJECT.md "Replay"), saving progress after each round
export async function runReplayJob(deps: JobDeps, job: ClaimedJob): Promise<string> {
    const { db, openai } = deps;
    // A replay is only requested once the verdict is found, and the
    // incident is deleted with its run
    const verdict = job.verdict!;
    const [run, calls] = await Promise.all([
        getRun(db, job.projectId, job.runId),
        getModelCalls(db, job.projectId, job.runId),
    ]);
    const plan = planReplay(verdict, run as StoredRun, calls);
    // Rounds saved before carry on: after the cap was raised, a failure or a crash
    const start: StoredReplay = {
        ...plan.base,
        rounds: job.replay?.rounds ?? [],
        outcome: null,
        limited: null,
        error: null,
    };
    const save = (replay: StoredReplay, spentUsd: number, state: "running" | "done" | "failed") =>
        saveReplay(db, job.projectId, job.id, replay, spentUsd, state);
    if (typeof plan.ready === "string") {
        await save({ ...start, limited: plan.ready }, job.spentUsd, "done");
        return plan.ready;
    }
    if (openai === undefined) {
        await save({ ...start, error: NO_KEY }, job.spentUsd, "failed");
        return `failed: ${NO_KEY}`;
    }
    const { bodies, back } = plan.ready;
    const rerun: Rerun = async (side) => {
        const answer = await callModel(openai, bodies[side], deps.fetch);
        return { harmful: isHarmful(answer.output, start.harmfulCall, back), costUsd: answer.costUsd };
    };
    const { rounds, spentUsd, outcome, error } = await runReplay(rerun, {
        spentUsd: job.spentUsd,
        capUsd: job.capUsd,
        firstRoundUsd: plan.firstRoundUsd,
        rounds: start.rounds,
        onRound: (progress) => save({ ...start, rounds: progress.rounds }, progress.spentUsd, "running"),
    });
    await save({ ...start, rounds, outcome, error }, spentUsd, error === null ? "done" : "failed");
    return error === null ? String(outcome) : `failed: ${error}`;
}

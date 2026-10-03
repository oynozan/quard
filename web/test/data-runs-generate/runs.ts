import { HOUR, NOW } from "@/lib/data/rng";
import { RunBuilder, type BuiltRun } from "@/lib/data/runs/build/builder";
import { generateRun } from "@/lib/data/runs/generate/run";
import type { RunPlan } from "@/lib/data/runs/generate/plan";
import type { Step } from "@/lib/data/runs/types";

// Two hours ago: outside the backend outage, and old enough to ask a human.
export const STARTED = NOW - 2 * HOUR;

export type Work = (b: RunBuilder, plan: RunPlan) => void;

// A valid run id from a small number.
export function runId(n: number): string {
    return n.toString(16).padStart(32, "0");
}

export function planOf(ending: RunPlan["ending"], fields: Partial<RunPlan> = {}): RunPlan {
    return { id: runId(1), root: "orchestrator", startedAt: STARTED, ending, canAsk: true, ...fields };
}

// Writes one run with the given work, seeded from run id n.
export function write(n: number, plan: RunPlan, work: Work): BuiltRun {
    const b = new RunBuilder(runId(n), plan.startedAt);
    work(b, plan);
    return b.finish();
}

// The first seeded run that matches. Seeds are fixed, so the pick never changes.
export function firstRun(plan: RunPlan, work: Work, match: (run: BuiltRun) => boolean): BuiltRun {
    for (let n = 1; n <= 400; n++) {
        const run = write(n, plan, work);
        if (match(run)) return run;
    }
    throw new Error("No seeded run matched");
}

// The first generated run that matches, for a plan with the given ending and fields.
export function firstGenerated(
    ending: RunPlan["ending"],
    fields: Partial<RunPlan>,
    match: (run: BuiltRun) => boolean,
): BuiltRun {
    for (let n = 1; n <= 400; n++) {
        const run = generateRun(planOf(ending, { ...fields, id: runId(n) }));
        if (match(run)) return run;
    }
    throw new Error("No seeded run matched");
}

// The raw value of a tool call's argument, before masking.
export function rawArg(run: BuiltRun, tool: string, name: string): string | undefined {
    return run.rawArgs.find((arg) => arg.tool === tool && arg.name === name)?.raw;
}

// Tool calls in order, as "name:status".
export function calls(run: BuiltRun): string[] {
    return run.steps.filter((step) => step.kind === "tool_call").map((step) => `${step.name}:${step.status}`);
}

export function has(run: BuiltRun, call: string): boolean {
    return calls(run).includes(call);
}

export function lastModel(run: BuiltRun, agent?: string): Step | undefined {
    return run.steps.filter((step) => step.kind === "model_call" && (!agent || step.agent === agent)).at(-1);
}

export function toolArg(run: BuiltRun, tool: string, name: string): string | undefined {
    return run.steps
        .find((step) => step.name === tool && step.kind === "tool_call")
        ?.args.find((arg) => arg.name === name)?.value;
}

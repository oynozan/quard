import { RunBuilder, type BuiltRun } from "@/lib/data/runs/build/builder";
import { toDetail } from "@/lib/data/runs/detail";
import { PINNED_RUNS } from "@/lib/data/runs/scripts/registry";
import type { Mark } from "@/lib/data/runs/build/state";
import type { RunDetail, Step } from "@/lib/data/runs/types";

export type Script = (b: RunBuilder) => void;
export type Built = { built: BuiltRun; detail: RunDetail };

// Writes a script into a fresh run, the way the run catalog does.
export function buildRun(write: Script, id: string, startedAt: number): Built {
    const builder = new RunBuilder(id, startedAt);
    write(builder);
    const built = builder.finish();
    return { built, detail: toDetail(built, { incidentId: null, approvalId: null }) };
}

// Builds a pinned run, found by id or by its script, with its own id and start time.
export function buildPinned(key: string | Script): Built {
    const pinned = PINNED_RUNS.find((run) => run.id === key || run.write === key);
    if (!pinned) throw new Error("No such pinned run");
    return buildRun(pinned.write, pinned.id, pinned.startedAt);
}

// The step a script marked with this role.
export function marked(run: Built, role: Mark): Step {
    const mark = run.built.marks.find((item) => item.role === role);
    const step = run.detail.steps.find((item) => item.id === mark?.stepId);
    if (!step) throw new Error(`No ${role} mark`);
    return step;
}

// Every tool call with this name, in time order.
export function callsTo(run: Built, name: string): Step[] {
    return run.detail.steps.filter((step) => step.kind === "tool_call" && step.name === name);
}

// The approval step under a call, if any.
export function approvalOf(run: Built, call: Step): Step | undefined {
    return run.detail.steps.find((step) => step.kind === "approval" && step.parentId === call.id);
}

// The guard decisions recorded under a call.
export function guardsOf(run: Built, call: Step): Step[] {
    return run.detail.steps.filter((step) => step.kind === "guard_decision" && step.parentId === call.id);
}

// The guard decision that blocked a call.
export function blockerOf(run: Built, call: Step): Step | undefined {
    return guardsOf(run, call).find((step) => step.status === "blocked");
}

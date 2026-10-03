import type { TokenUsage } from "@quard/shared";
import { runLimits } from "../../core/config.ts";
import type { GuardRefusal } from "../../core/refusal.ts";
import type { RunState } from "../../context/run.ts";
import { addModelCost, checkModelCall, judgeModelCall, type ModelCall } from "../../guards/limit/model-limits.ts";
import { isShared } from "../../guards/limit/run-counts.ts";
import { activeControl } from "../../transport/link/active.ts";
import { addToRun, readCost } from "./run-add.ts";

// Checks and counts a model call of a run that spans processes. The
// step is counted through control, with the cap when the run limits
// are enforced, and the cost so far is read from it.
export async function countSharedModelCall(call: ModelCall): Promise<GuardRefusal | undefined> {
    const limits = runLimits();
    const enforced = limits.mode === "block";
    // Already over the cost limit here, so no step is counted
    if (enforced && call.run.costUsd >= limits.costUsd) {
        return checkModelCall(call);
    }
    const control = activeControl();
    const step = { counter: "steps", add: 1, max: enforced ? limits.steps : undefined };
    const [steps, cost] = await Promise.all([addToRun(control, call.run, [step]), readCost(control, call.run)]);
    return judgeModelCall(call, steps[0] as number, cost);
}

// Adds a response's cost, and sends it to control when the run spans processes
export function addCost(run: RunState, model: string, usage: TokenUsage | undefined): void {
    const cost = addModelCost(run, model, usage);
    if (cost > 0 && Number.isFinite(cost) && isShared(run)) {
        activeControl()?.runs.send({ run, counter: "cost", add: cost });
    }
}

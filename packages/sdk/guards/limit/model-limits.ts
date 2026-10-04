import { costOf, type TokenUsage } from "@quard/shared";
import { runLimits } from "../../core/config.ts";
import { now, record } from "../../core/recorder.ts";
import { GuardRefusal } from "../../core/refusal.ts";
import type { RunState } from "../../context/run.ts";
import { rulesHash } from "../../policy/rules.ts";
import { policyVersion } from "../../policy/state.ts";

export type ModelCall = { run: RunState; agent: string; stepId: string; model: string };

// Steps and cost across the run, checked before a model call is sent.
// Records each limit that is over, and returns a refusal when the
// limits are enforced.
export function checkModelCall(call: ModelCall): GuardRefusal | undefined {
    return judgeModelCall(call, call.run.modelCalls + 1, call.run.costUsd);
}

// The same, from the run's steps with this call and its cost so far
export function judgeModelCall(call: ModelCall, steps: number, costUsd: number): GuardRefusal | undefined {
    const limits = runLimits();
    const over: string[] = [];
    if (steps > limits.steps) {
        over.push("max-steps");
    }
    if (costUsd >= limits.costUsd) {
        over.push("max-cost");
    }
    for (const rule of over) {
        record({
            type: "decision",
            runId: call.run.runId,
            stepId: call.stepId,
            agent: call.agent,
            at: now(),
            tool: call.model,
            guard: "limit",
            rule,
            decision: "block",
            mode: limits.mode,
            enforced: limits.mode === "block",
            reason: "limit_reached",
            policy: policyVersion(),
            rules: rulesHash(),
        });
    }
    if (over.length === 0 || limits.mode === "observe") {
        return undefined;
    }
    return new GuardRefusal({ guard: "limit", tool: call.model, reason: "limit_reached" });
}

// Counts a model call that is being sent
export function countModelCall(run: RunState): void {
    run.modelCalls += 1;
}

// A model with no known price adds nothing; the step limit still caps
// the run. Returns the cost added.
export function addModelCost(run: RunState, model: string, usage: TokenUsage | undefined): number {
    const cost = usage === undefined ? null : costOf(model, usage);
    if (cost === null) {
        return 0;
    }
    run.costUsd += cost;
    return cost;
}

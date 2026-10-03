import type { AgentRunCalls } from "@quard/db";
import { buildSteps } from "../../runs/live/steps";
import type { GuardDecision, Step } from "../../runs/types";
import type { Outcome } from "../../types";
import type { AgentCall } from "../types";

const STRICTNESS: Record<Outcome, number> = { block: 5, ask: 4, strip: 3, flag: 2, allow: 1, pass: 1 };

// The stricter outcome wins, and on a tie the enforced result beats the observed one
const weight = (guard: GuardDecision) => STRICTNESS[guard.outcome] * 2 + (guard.mode === "observe" ? 0 : 1);

function strictest(checks: GuardDecision[]): GuardDecision | null {
    return checks.reduce<GuardDecision | null>(
        (best, check) => (best && weight(best) >= weight(check) ? best : check),
        null,
    );
}

function callOf(runId: string, step: Step, steps: Step[]): AgentCall {
    const check = strictest(steps.flatMap((other) => (other.parentId === step.id && other.guard ? [other.guard] : [])));
    return {
        runId,
        stepId: step.id,
        at: step.startedAt,
        kind: step.kind,
        name: step.name,
        durationMs: step.durationMs,
        status: step.status,
        context: step.context,
        outcome: check?.outcome ?? null,
        mode: check?.mode ?? null,
    };
}

const isCall = (step: Step) => step.kind === "model_call" || step.kind === "tool_call";

// Each run is built on its own, since labels only apply within their run
export function timelineOf(groups: AgentRunCalls[]): AgentCall[] {
    const calls = groups.flatMap((group) => {
        const steps = buildSteps(group);
        return steps.filter(isCall).map((step) => callOf(group.runId, step, steps));
    });
    // Reversed before the stable sort, so calls at the same moment stay newest first
    return calls.reverse().sort((a, b) => b.at - a.at);
}

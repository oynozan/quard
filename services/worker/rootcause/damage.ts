import { callIdsOf, type StoredDecision, type StoredRun, type StoredStep } from "./run.ts";

export const NEVER_ARRIVED = "The blocked call's events never arrived";
export const RUN_LIMIT = "A run limit stopped a model call, so there is no tool call to trace";
export const PAID_OUTSIDE = "The payment was checked outside a guarded tool, so there is no tool call to trace";
export const ASKED_ONLY =
    "The model asked for a tool it may not use, and no guarded tool call followed, so there is no tool call to trace";

// Run limits check a model call before it is sent
const MODEL_LIMITS = new Set(["max-steps", "max-cost"]);

// The damaging tool call, and the run with each block moved onto the tool call it stopped
export type Damage = { step: StoredStep; run: StoredRun };

function runningAt(step: StoredStep, moment: Date): boolean {
    const end = step.at.getTime();
    return end - step.durationMs <= moment.getTime() && moment.getTime() <= end;
}

// The tool call a block stopped, or would have in observe mode
function toolOf(run: StoredRun, decision: StoredDecision): StoredStep | undefined {
    const tools = run.steps.filter((step) => step.kind === "tool_call");
    const own = run.steps.find((step) => step.stepId === decision.stepId);
    if (own?.kind === "tool_call") {
        return own;
    }
    if (own !== undefined) {
        // A call the model asked for maps to the tool call with its call id, else the next call of that tool
        const ids = callIdsOf(own, decision.tool);
        const next = tools.filter((step) => step.agent === own.agent && step.at.getTime() >= own.at.getTime());
        const asked = next.find((step) => step.callId !== null && ids.includes(step.callId));
        return asked ?? next.find((step) => step.name === decision.tool);
    }
    // A payment has its own step id, so it maps to the agent's innermost tool call running then
    return decision.guard === "x402"
        ? tools.find((step) => step.agent === decision.agent && runningAt(step, decision.at))
        : undefined;
}

// Why a block has no tool call to trace, or undefined when its tool call is missing
function whyNone(decision: StoredDecision): string | undefined {
    if (decision.guard === "limit" && MODEL_LIMITS.has(decision.rule)) {
        return RUN_LIMIT;
    }
    if (decision.guard === "x402") {
        return PAID_OUTSIDE;
    }
    return decision.rule === "requested-call" ? ASKED_ONLY : undefined;
}

// The run's first tool call a guard blocked or would have blocked, else why there is none
export function damageOf(run: StoredRun): Damage | string {
    const blocks = run.decisions.filter((decision) => decision.decision === "block");
    const tools = new Map(blocks.map((decision) => [decision, toolOf(run, decision)]));
    const stopped = new Set(tools.values());
    const step = run.steps.find(
        (item) => item.kind === "tool_call" && (item.status === "blocked" || stopped.has(item)),
    );
    if (step === undefined) {
        const reasons = blocks.map((decision) => whyNone(decision) ?? NEVER_ARRIVED);
        return reasons.includes(NEVER_ARRIVED) ? NEVER_ARRIVED : (reasons[0] ?? NEVER_ARRIVED);
    }
    const decisions = run.decisions.map((decision) => {
        const tool = tools.get(decision);
        return tool === undefined ? decision : { ...decision, stepId: tool.stepId };
    });
    return { step, run: { ...run, decisions } };
}

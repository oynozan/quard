import { pick } from "../../rng";
import { argsHash } from "../../values/hash";
import { APPROVERS } from "../../values/people";
import type { ArgFacts } from "../../guards/evaluate";
import type { ApprovalAnswer, BuildState } from "./state";
import type { Step } from "../types";

// How a human answers. "waiting" leaves the run waiting at the end of the data.
// "stopped" means the waiting process died, for example at a host time limit.
export type ApprovalPlan = {
    requestId?: string;
    answer: ApprovalAnswer | "waiting" | "stopped";
    by?: string;
    waitMs?: number;
};

export type AskResult = "approved" | "denied" | "waiting" | "stopped";

const STATE = { "approve once": "approved once", "always approve": "always approved", deny: "denied" } as const;

// The approval step under a call: a person sees the arguments, their origins and the path.
export function askHuman(s: BuildState, agent: string, call: Step, facts: ArgFacts[], plan?: ApprovalPlan): AskResult {
    const answer = plan?.answer ?? "approve once";
    const requestId = plan?.requestId ?? `apr_${s.newId().slice(0, 4)}`;
    const hash = argsHash(
        agent,
        call.name,
        facts.map((fact) => ({ name: fact.name, value: fact.raw })),
    );
    const step = s.step(agent, "approval", call.name, call.id, 0);
    step.approval = { requestId, state: "waiting", by: null, decidedAt: null, argsHash: hash };

    if (answer === "waiting") {
        step.status = "waiting";
        step.detail = "Waiting for a human";
        call.status = "waiting";
        s.ending = "waiting";
        return "waiting";
    }

    const waitMs = plan?.waitMs ?? s.int(40, 420) * 1000;
    step.durationMs = waitMs;
    s.wait(waitMs);

    if (answer === "stopped") {
        step.status = "error";
        step.approval.state = "no longer waiting";
        step.detail = "No longer waiting: the host stopped the waiting process. The request stays open";
        call.status = "error";
        call.error = "The host stopped the process while it waited for approval";
        s.ending = "failed";
        return "stopped";
    }

    const by = plan?.by ?? pick(s.rng, APPROVERS);
    step.approval = { ...step.approval, state: STATE[answer], by, decidedAt: s.clock };
    step.detail = `${answer === "deny" ? "Denied" : answer === "always approve" ? "Always approved" : "Approved once"} by ${by}`;
    s.approvals.push({
        requestId,
        runId: s.runId,
        stepId: step.id,
        agent,
        tool: call.name,
        answer,
        by,
        openedAt: step.startedAt,
        decidedAt: s.clock,
        argsHash: hash,
        args: call.args.map((arg) => ({ name: arg.name, value: arg.value })),
    });

    if (answer === "deny") {
        step.status = "blocked";
        call.status = "blocked";
        return "denied";
    }
    return "approved";
}

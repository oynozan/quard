import type { ApprovalAnswer, ApprovalRequest } from "../../core/config.ts";
import { approvalKey, isAlwaysApproved, rememberAlways } from "../../guards/approval/approval.ts";
import type { FailResult, GuardCall } from "../../guards/call.ts";
import { approved, blocked } from "./record.ts";

export type Approver = (request: ApprovalRequest) => Promise<ApprovalAnswer>;

const TIMED_OUT = Symbol("timed out");

// The approver's answer, or TIMED_OUT once the timeout passes
function answerOf(approver: Approver, call: GuardCall, ms: number | undefined): Promise<unknown> {
    const { runId, agent, stepId, tool, input, values } = call;
    const asked = approver({ runId, agent, stepId, tool, input, values });
    if (ms === undefined) {
        return asked;
    }
    let timer: NodeJS.Timeout | undefined;
    const late = new Promise((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
    });
    return Promise.race([asked, late]).finally(() => clearTimeout(timer));
}

// Only "once" and "always" approve, and an approver that fails blocks the call
export async function askApprover(
    call: GuardCall,
    approver: Approver,
    ms: number | undefined,
): Promise<FailResult | "approved"> {
    const key = approvalKey(call.agent, call.tool, call.input);
    if (isAlwaysApproved(key)) {
        return approved(call, "always-approved");
    }
    let answer: unknown;
    try {
        answer = await answerOf(approver, call, ms);
    } catch {
        return blocked(call, "approver-error", "approval_unavailable");
    }
    if (answer === TIMED_OUT) {
        return blocked(call, "timeout", "approval_timed_out");
    }
    if (answer !== "once" && answer !== "always") {
        return blocked(call, "human", "approval_denied");
    }
    if (answer === "always") {
        rememberAlways(key);
    }
    return approved(call, "human");
}

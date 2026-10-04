import type { ApprovalAnswer, ApprovalRequest } from "../../core/config.ts";
import { approvalKey, isAlwaysApproved, rememberAlways } from "../../guards/approval/approval.ts";
import type { FailResult, GuardCall } from "../../guards/call.ts";
import { approved, blocked } from "./record.ts";

export type Approver = (request: ApprovalRequest) => Promise<ApprovalAnswer>;

const TIMED_OUT = Symbol("timed out");
const ABORTED = Symbol("aborted");

// The approver's answer, TIMED_OUT once the timeout passes, or ABORTED
// once the signal aborts
function answerOf(
    approver: Approver,
    call: GuardCall,
    ms: number | undefined,
    signal: AbortSignal | undefined,
): Promise<unknown> {
    const { runId, agent, stepId, tool, input, values } = call;
    const asked = Promise.resolve(approver({ runId, agent, stepId, tool, input, values }));
    return new Promise((resolve, reject) => {
        // Called only after setup, once the first of the three happens
        const settle = (finish: () => void) => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            finish();
        };
        const onAbort = () => settle(() => resolve(ABORTED));
        const timer = ms === undefined ? undefined : setTimeout(() => settle(() => resolve(TIMED_OUT)), ms);
        signal?.addEventListener("abort", onAbort, { once: true });
        asked.then(
            (answer) => settle(() => resolve(answer)),
            (error: unknown) => settle(() => reject(error)),
        );
    });
}

// Only "once" and "always" approve, and an approver that fails blocks the call
export async function askApprover(
    call: GuardCall,
    approver: Approver,
    ms: number | undefined,
    signal?: AbortSignal,
): Promise<FailResult | "approved"> {
    const key = approvalKey(call.agent, call.tool, call.input);
    if (isAlwaysApproved(key)) {
        return approved(call, "always-approved");
    }
    let answer: unknown;
    try {
        answer = await answerOf(approver, call, ms, signal);
    } catch {
        return blocked(call, "approver-error", "approval_unavailable");
    }
    if (answer === TIMED_OUT) {
        return blocked(call, "timeout", "approval_timed_out");
    }
    if (answer === ABORTED) {
        return blocked(call, "aborted", "approval_timed_out");
    }
    if (answer !== "once" && answer !== "always") {
        return blocked(call, "human", "approval_denied");
    }
    if (answer === "always") {
        rememberAlways(key);
    }
    return approved(call, "human");
}

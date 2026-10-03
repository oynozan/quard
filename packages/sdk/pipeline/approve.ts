import { getConfig } from "../core/config.ts";
import { approvalKey, isAlwaysApproved, rememberAlways } from "../guards/approval/approval.ts";
import type { FailResult, GuardCall } from "../guards/call.ts";
import { recordDecision } from "./checks.ts";

function blocked(call: GuardCall, rule: string, reason: "approval_unavailable" | "approval_denied"): FailResult {
    const result: FailResult = { guard: "approval", rule, decision: "block", mode: "block", reason };
    recordDecision(call, result);
    return result;
}

// Asks a human. Only "once" and "always" approve; any other answer, a
// missing approver or an approver that fails all block the call.
export async function askHuman(call: GuardCall): Promise<FailResult | "approved"> {
    const key = approvalKey(call.agent, call.tool, call.input);
    if (isAlwaysApproved(key)) {
        recordDecision(call, { guard: "approval", rule: "always-approved", decision: "allow", mode: "block" });
        return "approved";
    }
    const approver = getConfig().approver;
    if (approver === undefined) {
        return blocked(call, "no-approver", "approval_unavailable");
    }
    let answer: unknown;
    try {
        answer = await approver({
            runId: call.runId,
            agent: call.agent,
            stepId: call.stepId,
            tool: call.tool,
            input: call.input,
            values: call.values,
        });
    } catch {
        return blocked(call, "approver-error", "approval_unavailable");
    }
    if (answer !== "once" && answer !== "always") {
        return blocked(call, "human", "approval_denied");
    }
    if (answer === "always") {
        rememberAlways(key);
    }
    recordDecision(call, { guard: "approval", rule: "human", decision: "allow", mode: "block" });
    return "approved";
}

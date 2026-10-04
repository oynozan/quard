import type { DecisionEvent } from "@quard/shared";
import { now, record } from "../core/recorder.ts";
import { checkAction } from "../guards/action/action.ts";
import { checkApproval } from "../guards/approval/approval.ts";
import type { FailResult, GuardCall, Mode, RuleResult } from "../guards/call.ts";
import { checkEgress } from "../guards/egress/egress.ts";
import { checkLimit } from "../guards/limit/limit.ts";
import type { ApprovalOptions, GuardOptions } from "../guards/options.ts";
import { rulesHash } from "../policy/rules.ts";
import { policyVersion } from "../policy/state.ts";
import { checkSignatureInput } from "../signatures/check.ts";
import { activeControl } from "../transport/link/active.ts";

// Marks a guard's asks with its timeout
function withTimeout(results: RuleResult[], timeout: number | undefined): RuleResult[] {
    return timeout === undefined
        ? results
        : results.map((result) => (result.decision === "ask" ? { ...result, timeout } : result));
}

// The guards that act before a call, in pipeline order
export function preChecks(call: GuardCall, list: readonly GuardOptions[], withApproval: boolean): RuleResult[] {
    const results: RuleResult[] = checkSignatureInput(call);
    const fleet = activeControl()?.fleet;
    for (const options of list) {
        if (options.type === "limit") {
            results.push(...checkLimit(call, options, fleet));
        }
    }
    for (const options of list) {
        if (options.type === "action") {
            results.push(...withTimeout(checkAction(call, options), options.timeout));
        }
    }
    for (const options of list) {
        if (options.type === "egress") {
            results.push(...withTimeout(checkEgress(call, options), options.timeout));
        }
    }
    const approval = list.find((options): options is ApprovalOptions => options.type === "approval");
    if (withApproval && approval !== undefined) {
        results.push(...withTimeout(checkApproval(), approval.timeout));
    }
    return results;
}

// The strictest result wins: block, then ask, then allow.
// Rules in observe mode never change the decision.
export function decide(results: readonly RuleResult[]): FailResult | undefined {
    const enforced = results.filter(
        (result): result is FailResult => result.mode === "block" && result.decision !== "allow",
    );
    return enforced.find((result) => result.decision === "block") ?? enforced[0];
}

// The enforced asks a human must settle
export function asksOf(results: readonly RuleResult[]): FailResult[] {
    return results.filter((result): result is FailResult => result.mode === "block" && result.decision === "ask");
}

// The shortest timeout, in seconds, among the guards that asked
export function askTimeout(asks: readonly FailResult[]): number | undefined {
    const timeouts = asks.flatMap((ask) => (ask.timeout === undefined ? [] : [ask.timeout]));
    return timeouts.length === 0 ? undefined : Math.min(...timeouts);
}

// What one rule decided. Output checks can also pass, strip or flag.
export type Outcome = {
    guard: string;
    rule: string;
    decision: DecisionEvent["decision"];
    mode: Mode;
    reason?: string;
    field?: string;
    score?: number;
    // The approval request that answered the call
    request?: string;
};

export function recordDecision(call: GuardCall, result: Outcome): void {
    record({
        type: "decision",
        runId: call.runId,
        stepId: call.stepId,
        agent: call.agent,
        at: now(),
        tool: call.tool,
        guard: result.guard,
        rule: result.rule,
        decision: result.decision,
        mode: result.mode,
        enforced: result.mode === "block",
        reason: result.reason,
        field: result.field,
        score: result.score,
        policy: policyVersion(),
        rules: rulesHash(),
        request: result.request,
    });
}

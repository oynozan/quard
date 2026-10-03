import { now, record } from "../core/recorder.ts";
import { checkAction } from "../guards/action/action.ts";
import { checkApproval } from "../guards/approval/approval.ts";
import type { FailResult, GuardCall, RuleResult } from "../guards/call.ts";
import { checkEgress } from "../guards/egress/egress.ts";
import { checkLimit, countLimit } from "../guards/limit/limit.ts";
import type { GuardOptions } from "../guards/options.ts";

// The guards that act before a call, in pipeline order
export function preChecks(call: GuardCall, list: readonly GuardOptions[], withApproval: boolean): RuleResult[] {
    const results: RuleResult[] = [];
    for (const options of list) {
        if (options.type === "limit") {
            results.push(...checkLimit(call, options));
        }
    }
    for (const options of list) {
        if (options.type === "action") {
            results.push(...checkAction(call, options));
        }
    }
    for (const options of list) {
        if (options.type === "egress") {
            results.push(...checkEgress(call, options));
        }
    }
    if (withApproval && list.some((options) => options.type === "approval")) {
        results.push(...checkApproval());
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

export function countLimits(call: GuardCall, list: readonly GuardOptions[]): void {
    for (const options of list) {
        if (options.type === "limit") {
            countLimit(call, options);
        }
    }
}

export function recordDecision(call: GuardCall, result: RuleResult): void {
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
    });
}

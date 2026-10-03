import type { ReasonCode } from "@quard/shared";
import type { FailResult, GuardCall } from "../../guards/call.ts";
import { recordDecision } from "../checks.ts";

// setTimeout can't wait longer than about 24.8 days
const MAX_WAIT_MS = 2_147_483_647;

// Records why the approval step blocked the call
export function blocked(call: GuardCall, rule: string, reason: ReasonCode, request?: string): FailResult {
    const result: FailResult = { guard: "approval", rule, decision: "block", mode: "block", reason };
    recordDecision(call, { ...result, request });
    return result;
}

export function approved(call: GuardCall, rule: string, request?: string): "approved" {
    recordDecision(call, { guard: "approval", rule, decision: "allow", mode: "block", request });
    return "approved";
}

// The approval guard's timeout, from seconds
export function timeoutMs(seconds: number | undefined): number | undefined {
    return seconds === undefined ? undefined : Math.min(seconds * 1000, MAX_WAIT_MS);
}

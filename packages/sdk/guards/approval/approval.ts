import { canonicalJson } from "../../context/canonical.ts";
import type { RuleResult } from "../call.ts";

// "Always approve" covers the same agent, tool and exact arguments
const always = new Set<string>();

export function checkApproval(): RuleResult[] {
    return [{ guard: "approval", rule: "approval", decision: "ask", mode: "block", reason: "approval_required" }];
}

export function approvalKey(agent: string, tool: string, input: unknown): string {
    return `${agent}\u0000${tool}\u0000${canonicalJson(input)}`;
}

export function isAlwaysApproved(key: string): boolean {
    return always.has(key);
}

export function rememberAlways(key: string): void {
    always.add(key);
}

// Revoked in the dashboard from M3 on
export function revokeAlways(key: string): void {
    always.delete(key);
}

export function clearApprovals(): void {
    always.clear();
}

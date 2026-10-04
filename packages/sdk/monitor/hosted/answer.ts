import { GuardRefusal } from "../../core/refusal.ts";
import { mayUse } from "../../context/scope.ts";
import type { FailResult, RuleResult } from "../../guards/call.ts";
import type { ApprovalOptions } from "../../guards/options.ts";
import { askHuman } from "../../pipeline/approval/human.ts";
import { asksOf, decide, preChecks, recordDecision } from "../../pipeline/checks.ts";
import { countCall } from "../../pipeline/count/count.ts";
import { buildCall } from "../../pipeline/guard.ts";
import { asRecord } from "../json.ts";
import { findApproval, type HostedApproval } from "./mcp.ts";
import { hostedOptions } from "./rules.ts";

// The input item that answers one hosted MCP approval request
export type McpApprovalResponse = {
    type: "mcp_approval_response";
    approval_request_id: string;
    approve: boolean;
    reason?: string;
};

// The same checks guard() runs before a call, on the tool's name. An ask
// waits for a human, then the block checks run again.
async function settle(entry: HostedApproval): Promise<FailResult | undefined> {
    const list = hostedOptions(entry.tool);
    const call = buildCall(entry.tool, entry.args, entry.scope, entry.stepId);
    const base = { guard: "permission", rule: "hosted-mcp", mode: "block" } as const;
    const permission: RuleResult = mayUse(entry.scope, entry.tool)
        ? { ...base, decision: "allow" }
        : { ...base, decision: "block", reason: "permission_denied" };
    let checked = [permission, ...preChecks(call, list, true)];
    checked.forEach((result) => recordDecision(call, result));
    let final = decide(checked);
    if (final?.decision === "ask") {
        const approval = list.find((item): item is ApprovalOptions => item.type === "approval");
        const answer = await askHuman(call, asksOf(checked), approval?.timeout);
        if (answer !== "approved") {
            return answer;
        }
        checked = preChecks(call, list, false);
        checked.forEach((result) => recordDecision(call, result));
        final = decide(checked);
        if (final?.decision !== "block") {
            final = undefined;
        }
    }
    return final ?? countCall(call, list, checked);
}

type Stop = Pick<FailResult, "guard" | "reason" | "field">;

// A request the monitor never checked is refused
const UNCHECKED: Stop = { guard: "permission", reason: "approval_unavailable" };

// Decided once; asking again gives the same answer
function settled(entry: HostedApproval | undefined): Promise<Stop | undefined> {
    if (entry === undefined) {
        return Promise.resolve(UNCHECKED);
    }
    entry.answer ??= settle(entry);
    return entry.answer;
}

async function answer(id: string, tool: string): Promise<McpApprovalResponse> {
    const stop = await settled(findApproval(id));
    const base = { type: "mcp_approval_response", approval_request_id: id } as const;
    if (stop === undefined) {
        return { ...base, approve: true };
    }
    const refusal = new GuardRefusal({ guard: stop.guard, tool, reason: stop.reason, field: stop.field });
    return { ...base, approve: false, reason: refusal.text };
}

// Answers each hosted MCP approval request in a response with Quard's
// decision. The app sends these items in its next request; monitor never
// sends a follow-up itself.
export function mcpApprovals(response: unknown): Promise<McpApprovalResponse[]> {
    const output = asRecord(response)?.output;
    const requests = (Array.isArray(output) ? output : [])
        .map(asRecord)
        .filter((item) => item?.type === "mcp_approval_request");
    return Promise.all(requests.map((item) => answer(String(item?.id), String(item?.name))));
}

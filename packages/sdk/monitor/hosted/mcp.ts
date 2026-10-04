import { labelFor } from "@quard/shared";
import { getConfig } from "../../core/config.ts";
import type { Scope } from "../../context/scope.ts";
import type { FailResult } from "../../guards/call.ts";
import { indexContent } from "../input-labels.ts";
import { parseJson } from "../json.ts";
import type { Step } from "../step.ts";

// A hosted MCP approval request the monitor saw, in the run that saw it
export type HostedApproval = {
    tool: string;
    args: unknown;
    scope: Scope;
    stepId: string;
    // Set once the app asks for the answer, so it is decided only once
    answer?: Promise<FailResult | undefined>;
};

const MAX_ENTRIES = 10_000;
const approvals = new Map<string, HostedApproval>();

export function findApproval(id: string): HostedApproval | undefined {
    return approvals.get(id);
}

export function clearHostedApprovals(): void {
    approvals.clear();
}

// Keeps the request for mcpApprovals(), which checks it when the app
// asks, so its checks and counts happen together, as in guard()
export function noteApprovalRequest(step: Step, item: Record<string, unknown>): void {
    const args = typeof item.arguments === "string" ? (parseJson(item.arguments) ?? item.arguments) : {};
    const entry = { tool: String(item.name), args, scope: step.scope, stepId: step.stepId };
    approvals.set(String(item.id), entry);
    if (approvals.size > MAX_ENTRIES) {
        approvals.delete(approvals.keys().next().value as string);
    }
}

// What a hosted MCP tool returned is untrusted content from its server
export function labelMcpCall(step: Step, item: Record<string, unknown>): void {
    if (typeof item.output !== "string") {
        return;
    }
    const origin = `mcp:${String(item.server_label)}`;
    indexContent(step, item.output, labelFor(origin, getConfig().origins, ["unscanned"]));
}

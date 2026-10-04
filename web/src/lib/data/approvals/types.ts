import type { DecidedApprovalItem } from "@quard/db";
import type { GuardDecision } from "../runs/types";
import type { ApprovalArg, ApprovalRequest, PathNode } from "../types";

// Waiting calls send heartbeats. When they stop, the request shows as "no longer waiting".
export type Heartbeat = {
    state: "live" | "stopped";
    // The last beat, or when the last call stopped waiting
    lastAt: number;
};

// An argument as the approver sees it: the full value plus where it came from.
export type ApprovalArgDetail = ApprovalArg & {
    // The value as the rest of the dashboard shows it
    masked: string;
};

// Another call with the same agent, tool and arguments. It waits on this request.
export type JoinedCall = { runId: string; stepId: string; agent: string; since: number };

export type ApprovalDetail = {
    request: ApprovalRequest;
    args: ApprovalArgDetail[];
    // Origin, the agent that read it, handoffs, then this call. Empty until the run arrives.
    path: PathNode[];
    decisions: GuardDecision[];
    heartbeat: Heartbeat;
    joined: JoinedCall[];
    argsHash: string;
};

export type ApprovalAnswer = "approve once" | "always approve" | "deny";

// The answer as stored and sent to control
export type ApprovalCode = DecidedApprovalItem["answer"];

// A past answer. After the decision only the hash and masks are kept.
export type ApprovalDecision = {
    requestId: string;
    runId: string;
    stepId: string;
    agent: string;
    tool: string;
    answer: ApprovalAnswer;
    by: string;
    openedAt: number;
    decidedAt: number;
    argsHash: string;
    args: { name: string; value: string }[];
};

// "Always approve": later calls from the same agent, tool and exact arguments pass without asking.
export type AlwaysGrant = {
    id: string;
    agent: string;
    tool: string;
    argsHash: string;
    args: { name: string; value: string }[];
    approvedBy: string;
    approvedAt: number;
    timesUsed: number;
    lastUsedAt: number | null;
    revokedAt: number | null;
    revokedBy: string | null;
};

export type ApprovalsData = {
    open: ApprovalDetail[];
    // Open requests past the list, which "Show more" lists
    more: number;
    grants: AlwaysGrant[];
    decisions: ApprovalDecision[];
};

import type { ApprovalAnswer } from "../runs/build/state";
import type { GuardDecision, RunRow } from "../runs/types";
import type { ApprovalArg, ApprovalRequest, Label, PathNode, ValueAppearance, ValueKind } from "../types";

// Waiting calls send heartbeats. When they stop, the request shows as "no longer waiting".
export type Heartbeat = {
    state: "live" | "stopped";
    lastAt: number;
    intervalMs: number;
    // Why the waiting process stopped, in plain words.
    stoppedReason: string | null;
};

// An argument as the approver sees it: the full value plus where it came from.
export type ApprovalArgDetail = ApprovalArg & {
    kind: ValueKind;
    traced: boolean;
    // The value as the rest of the dashboard shows it.
    masked: string;
    appearances: ValueAppearance[];
};

// Another call with the same agent, tool and arguments. It waits on this request.
export type JoinedCall = { runId: string; stepId: string; agent: string; since: number };

export type ApprovalDetail = {
    request: ApprovalRequest;
    args: ApprovalArgDetail[];
    // Origin, the agent that read it, handoffs, then this call.
    path: PathNode[];
    context: Label;
    decisions: GuardDecision[];
    heartbeat: Heartbeat;
    identicalWaiting: boolean;
    joined: JoinedCall[];
    argsHash: string;
    run: RunRow;
};

export type { ApprovalAnswer };

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
    grants: AlwaysGrant[];
    decisions: ApprovalDecision[];
};

import type { ApprovalAnswer, ArgumentLabelMessage, AskMessage, AskReason } from "@quard/shared";

export type ApprovalContext = AskMessage["context"];

// What control stores when a call asks for a human
export type ApprovalRequestInput = {
    runId: string;
    stepId: string;
    agent: string;
    tool: string;
    argsHash: string;
    // Full values with secrets removed, for the approver
    args: unknown;
    // The arguments as the rest of the dashboard shows them
    masked: unknown;
    labels: ArgumentLabelMessage[];
    context: ApprovalContext;
    reasons: AskReason[];
    rulesHash?: string | null;
};

// What every request keeps, open or decided
export type ApprovalRequestFields = {
    id: string;
    // The call that asked first
    runId: string;
    stepId: string;
    agent: string;
    tool: string;
    argsHash: string;
    masked: unknown;
    labels: ArgumentLabelMessage[];
    context: ApprovalContext;
    reasons: AskReason[];
    rulesHash: string | null;
    openedAt: Date;
};

export type ApprovalRequestDetail = ApprovalRequestFields & {
    // Null once decided
    args: unknown;
    answer: ApprovalAnswer | null;
    decidedBy: string | null;
    decidedAt: Date | null;
    // The waiting call that ran an "approve once"
    usedBy: string | null;
    usedAt: Date | null;
};

export type ApprovalWaiterInput = { askId: string; requestId: string; runId: string; stepId: string; agent: string };

export type ApprovalWaiter = {
    askId: string;
    runId: string;
    stepId: string;
    agent: string;
    since: Date;
    lastBeatAt: Date;
    // Set when the call got its answer or stopped waiting
    doneAt: Date | null;
};

// An open request as the approvals page lists it, with every call waiting on it
export type OpenApprovalItem = ApprovalRequestFields & { args: unknown; waiters: ApprovalWaiter[] };

// A past answer. Only the hash and the masked arguments are kept.
export type DecidedApprovalItem = ApprovalRequestFields & {
    answer: ApprovalAnswer;
    decidedBy: string | null;
    decidedAt: Date;
    usedBy: string | null;
    usedAt: Date | null;
};

// An "always approve" answer, revoked ones included
export type ApprovalGrantItem = {
    id: string;
    requestId: string;
    agent: string;
    tool: string;
    argsHash: string;
    masked: unknown;
    approvedBy: string;
    approvedAt: Date;
    timesUsed: number;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
    revokedBy: string | null;
};

// A decided request, for control to tell the calls waiting on it
export type RequestDecision = { projectId: string; id: string; answer: ApprovalAnswer; usedBy: string | null };

// A call that may use an earlier "approve once" for the same agent, tool and arguments
export type OnceClaim = { askId: string; agent: string; tool: string; argsHash: string };

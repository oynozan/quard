// Approval requests, "always approve" grants and past answers, read from Postgres.
export { getApproval, getApprovals, openApprovalCount, openApprovalRequests } from "./approvals/query";
export type {
    AlwaysGrant,
    ApprovalAnswer,
    ApprovalArgDetail,
    ApprovalCode,
    ApprovalDecision,
    ApprovalDetail,
    ApprovalsData,
    Heartbeat,
    JoinedCall,
} from "./approvals/types";

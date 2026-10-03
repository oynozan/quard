// Open approval requests, newest first. Built from the runs that asked.
export { openApprovals } from "./approvals/requests";
export { getApprovals, getApproval } from "./approvals/query";
export type {
    AlwaysGrant,
    ApprovalAnswer,
    ApprovalArgDetail,
    ApprovalDecision,
    ApprovalDetail,
    ApprovalsData,
    Heartbeat,
    JoinedCall,
} from "./approvals/types";

import type { ApprovalsData } from "./types";

// Open requests, "always approve" grants and past answers. Nothing stores approvals yet
export async function getApprovals(): Promise<ApprovalsData> {
    return { open: [], grants: [], decisions: [] };
}

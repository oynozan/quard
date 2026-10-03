// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as approvals from "./approvals";
import { getApproval, getApprovals, openApprovalCount, openApprovalRequests } from "./approvals/query";

describe("approvals data", () => {
    it("exposes the approvals page, overview and sidebar queries", () => {
        expect(approvals.getApprovals).toBe(getApprovals);
        expect(approvals.getApproval).toBe(getApproval);
        expect(approvals.openApprovalRequests).toBe(openApprovalRequests);
        expect(approvals.openApprovalCount).toBe(openApprovalCount);
    });
});

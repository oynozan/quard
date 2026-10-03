// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as approvals from "./approvals";
import { getApproval, getApprovals } from "./approvals/query";
import { openApprovals } from "./approvals/requests";

describe("approvals data", () => {
    it("exposes the open requests and the approvals page queries", () => {
        expect(approvals.openApprovals).toBe(openApprovals);
        expect(approvals.getApprovals).toBe(getApprovals);
        expect(approvals.getApproval).toBe(getApproval);
    });
});

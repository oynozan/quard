// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as approvals from "./approvals";
import { getApprovals } from "./approvals/query";

describe("approvals data", () => {
    it("exposes only the approvals page query", () => {
        expect(approvals.getApprovals).toBe(getApprovals);
        expect(Object.keys(approvals)).toEqual(["getApprovals"]);
    });
});

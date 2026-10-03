// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getApprovals } from "./query";

describe("getApprovals", () => {
    it("has no requests, grants or answers while nothing stores approvals", async () => {
        expect(await getApprovals()).toEqual({ open: [], grants: [], decisions: [] });
    });
});

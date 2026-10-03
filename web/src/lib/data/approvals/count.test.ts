// @vitest-environment node
import { redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";

const scope = vi.hoisted(() => ({ projectScope: vi.fn() }));
vi.mock("../scope", () => scope);

const { openApprovalCount } = await import("./query");

afterEach(() => {
    vi.restoreAllMocks();
    scope.projectScope.mockReset();
});

describe("openApprovalCount", () => {
    it("leaves the badge out when the count cannot be read, and logs why", async () => {
        const failure = new Error("DATABASE_URL is not set");
        scope.projectScope.mockRejectedValue(failure);
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        expect(await openApprovalCount()).toBe(0);
        expect(log).toHaveBeenCalledWith("Quard: could not count open approvals", failure);
    });

    it("still sends a visitor without a session to sign in", async () => {
        scope.projectScope.mockImplementation(async () => redirect("/sign-in"));
        await expect(openApprovalCount()).rejects.toThrow("NEXT_REDIRECT");
    });
});

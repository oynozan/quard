import { afterEach, describe, expect, it } from "vitest";
import {
    approvalKey,
    checkApproval,
    clearApprovals,
    isAlwaysApproved,
    rememberAlways,
    revokeAlways,
} from "./approval.ts";

afterEach(() => {
    clearApprovals();
});

describe("approval", () => {
    it("always asks", () => {
        expect(checkApproval()).toEqual([
            { guard: "approval", rule: "approval", decision: "ask", mode: "block", reason: "approval_required" },
        ]);
    });

    it("remembers always-approved calls by agent, tool and exact arguments", () => {
        const key = approvalKey("billing", "pay", { iban: "X", amount: 1 });
        rememberAlways(key);

        expect(isAlwaysApproved(approvalKey("billing", "pay", { amount: 1, iban: "X" }))).toBe(true);
        expect(isAlwaysApproved(approvalKey("billing", "pay", { amount: 2, iban: "X" }))).toBe(false);
        expect(isAlwaysApproved(approvalKey("other", "pay", { amount: 1, iban: "X" }))).toBe(false);

        revokeAlways(key);
        expect(isAlwaysApproved(key)).toBe(false);
    });
});

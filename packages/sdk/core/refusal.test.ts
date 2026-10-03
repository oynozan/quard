import { describe, expect, it } from "vitest";
import { GuardBlockedError, GuardRefusal, isBlockedError, isGuardRefusal } from "./refusal.ts";

const refusal = new GuardRefusal({ guard: "egress", tool: "sendEmail", reason: "destination_not_allowed" });

describe("GuardRefusal", () => {
    it("reads as plain text", () => {
        expect(String(refusal)).toBe(refusal.text);
        expect(refusal.text).toContain("The sendEmail call did NOT run.");
        expect(refusal.field).toBeUndefined();
    });

    it("turns into JSON for frameworks", () => {
        expect(JSON.parse(JSON.stringify(refusal))).toEqual({
            blocked: true,
            guard: "egress",
            reason: "destination_not_allowed",
            message: refusal.text,
        });
    });

    it("is recognized by isGuardRefusal", () => {
        expect(isGuardRefusal(refusal)).toBe(true);
        expect(isGuardRefusal({ blocked: true })).toBe(false);
    });
});

describe("GuardBlockedError", () => {
    it("carries the refusal", () => {
        const error = new GuardBlockedError(
            new GuardRefusal({ guard: "action", tool: "pay", reason: "amount_over_cap", field: "amount" }),
        );

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("GuardBlockedError");
        expect(error.guard).toBe("action");
        expect(error.reason).toBe("amount_over_cap");
        expect(error.message).toContain("the amount value is over the allowed limit");
    });
});

describe("isBlockedError", () => {
    it("knows a guard's throw and the OpenAI client's error for a refused model call", () => {
        // What the OpenAI client throws for the 403 the wrapped client answers with
        const fromClient = Object.assign(new Error("403 Blocked"), { status: 403, type: "quard_blocked" });

        expect(isBlockedError(new GuardBlockedError(refusal))).toBe(true);
        expect(isBlockedError(fromClient)).toBe(true);
    });

    it("leaves other errors alone", () => {
        expect(isBlockedError(new Error("boom"))).toBe(false);
        expect(isBlockedError(Object.assign(new Error("403"), { type: "invalid_request_error" }))).toBe(false);
        expect(isBlockedError("quard_blocked")).toBe(false);
        expect(isBlockedError(null)).toBe(false);
        expect(isBlockedError(undefined)).toBe(false);
    });
});

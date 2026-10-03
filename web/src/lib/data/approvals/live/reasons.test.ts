// @vitest-environment node
import { describe, expect, it } from "vitest";
import { reasonText, reasonWords, requestReason } from "./reasons";

describe("reasonWords", () => {
    it("writes a reason code in plain words", () => {
        expect(reasonWords("value_not_from_allowed_origin")).toBe("Value not from allowed origin");
        expect(reasonWords("instructions,invisible_text")).toBe("Instructions, invisible text");
        expect(reasonWords("")).toBe("");
    });
});

describe("reasonText", () => {
    it("says the approval guard always asks, and words every other reason", () => {
        expect(reasonText("approval_required", "payInvoice")).toBe("payInvoice asks a human first");
        expect(reasonText("amount_over_cap", "payInvoice")).toBe("Amount over cap");
    });
});

describe("requestReason", () => {
    it("joins each asking rule's reason once", () => {
        const reasons = [
            { guard: "approval", rule: "approval", reason: "approval_required" },
            { guard: "action", rule: "iban:from", reason: "value_not_from_allowed_origin", field: "iban" },
            { guard: "action", rule: "to:from", reason: "value_not_from_allowed_origin", field: "to" },
        ];
        expect(requestReason(reasons, "payInvoice")).toBe(
            "payInvoice asks a human first · Value not from allowed origin",
        );
    });

    it("falls back to the approval reason when no rule gave one", () => {
        expect(requestReason([], "payInvoice")).toBe("payInvoice asks a human first");
        expect(requestReason([{ guard: "limit", rule: "cap", reason: "" }], "payInvoice")).toBe(
            "payInvoice asks a human first",
        );
    });
});

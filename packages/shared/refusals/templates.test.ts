import { describe, expect, it } from "vitest";
import { refusalText, type ReasonCode } from "./templates.ts";

const ALL: ReasonCode[] = [
    "permission_denied",
    "value_not_from_allowed_origin",
    "value_model_generated",
    "amount_over_cap",
    "recipient_never_seen",
    "destination_not_allowed",
    "destination_from_untrusted_content",
    "limit_reached",
    "approval_required",
    "approval_unavailable",
    "approval_denied",
    "content_blocked",
    "rule_failed",
];

describe("refusalText", () => {
    it("names the guard, the field and the tool", () => {
        expect(
            refusalText({
                guard: "action",
                tool: "payInvoice",
                reason: "value_not_from_allowed_origin",
                field: "iban",
            }),
        ).toBe(
            "Blocked by the action guard: the iban value did not come from an allowed source. The payInvoice call did NOT run. Do not retry it; tell the user what was blocked.",
        );
    });

    it("says the result was withheld for blocked content", () => {
        expect(refusalText({ guard: "source", tool: "fetchPage", reason: "content_blocked" })).toContain(
            "The fetchPage result was withheld.",
        );
    });

    it.each(ALL)("has a sentence for %s", (reason) => {
        const text = refusalText({ guard: "action", tool: "t", reason });

        expect(text).toMatch(/^Blocked by the action guard: .+\. The t (call did NOT run|result was withheld)\./);
        expect(text).not.toContain("undefined");
    });
});

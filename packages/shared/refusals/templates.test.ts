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
    "signature_matched",
    "sensitive_data",
    "signatures_unavailable",
    "backend_unavailable",
    "approval_timed_out",
    "daily_limit_reached",
    "value_quarantined",
    "call_aborted",
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

    it("names the signature and the kind of sensitive data", () => {
        expect(
            refusalText({ guard: "signature", tool: "runCode", reason: "signature_matched", field: "QS-1" }),
        ).toContain("it matched the known attack signature QS-1.");
        expect(
            refusalText({ guard: "egress", tool: "sendEmail", reason: "sensitive_data", field: "secret" }),
        ).toContain("the data to send holds a sensitive value (secret).");
    });

    it("says a cancelled call did not run", () => {
        expect(refusalText({ guard: "abort", tool: "payInvoice", reason: "call_aborted" })).toBe(
            "Blocked by the abort guard: the call was cancelled before it ran. The payInvoice call did NOT run. Do not retry it; tell the user what was blocked.",
        );
    });
});

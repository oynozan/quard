import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { guardDecision } from "../../../test/approvals-overview/fixtures";
import { GuardChecks } from "./guard-checks";

const SHOWN = "pay_invoice always asks a human first";

const DECISIONS = [
    guardDecision({ rule: "pay_invoice.daily-cap", ruleHash: "a1", reason: "23,350 of 50,000 EUR today" }),
    guardDecision({ rule: "fleet-check", ruleHash: "b2", outcome: "pass", reason: "" }),
    guardDecision({
        rule: "pay_invoice.iban-source",
        ruleHash: "c3",
        outcome: "block",
        mode: "observe",
        reason: "The IBAN first appeared in web content",
    }),
    guardDecision({ rule: "pay_invoice", ruleHash: "d4", outcome: "ask", mode: null, reason: SHOWN }),
];

function rowText(rule: string): string | null | undefined {
    return screen.getByText(rule).closest("li")?.textContent;
}

describe("GuardChecks", () => {
    it("shows nothing when no guard checked the call", () => {
        const { container } = render(<GuardChecks decisions={[]} shown={SHOWN} />);
        expect(container.innerHTML).toBe("");
    });

    it("lists the checks that need a person and folds the passed ones behind a count", () => {
        render(<GuardChecks decisions={DECISIONS} shown={SHOWN} />);
        const [flagged, passed] = screen.getAllByRole("list", { hidden: true });
        expect(flagged.querySelectorAll("li")).toHaveLength(2);
        expect(passed.hidden).toBe(true);
        expect(passed.querySelectorAll("li")).toHaveLength(2);
        const toggle = screen.getByRole("button", { name: "2 more passed" });
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(toggle.getAttribute("aria-controls")).toBe(passed.id);
    });

    it("leaves out a reason already shown above the checks", () => {
        render(<GuardChecks decisions={DECISIONS} shown={SHOWN} />);
        expect(rowText("pay_invoice")).toBe("pay_invoiceAsks a human");
        expect(rowText("pay_invoice.iban-source")).toBe(
            "pay_invoice.iban-sourceThe IBAN first appeared in web contentWould block",
        );
    });

    it("opens and closes the passed checks", () => {
        render(<GuardChecks decisions={DECISIONS} shown={SHOWN} />);
        fireEvent.click(screen.getByRole("button", { name: "2 more passed" }));
        const toggle = screen.getByRole("button", { name: "Hide passed checks" });
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        expect(rowText("pay_invoice.daily-cap")).toBe("pay_invoice.daily-cap23,350 of 50,000 EUR todayAllowed");
        expect(rowText("fleet-check")).toBe("fleet-checkAllowed");
        fireEvent.click(toggle);
        expect(screen.getByRole("button", { name: "2 more passed" }).getAttribute("aria-expanded")).toBe("false");
    });

    it("has no toggle when every check needs a person", () => {
        render(<GuardChecks decisions={DECISIONS.slice(2)} shown={SHOWN} />);
        expect(screen.getAllByRole("listitem")).toHaveLength(2);
        expect(screen.queryByRole("button")).toBeNull();
    });
});

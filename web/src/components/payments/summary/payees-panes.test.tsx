import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { emptySpend, fullSpend, OTHER, PAYEE } from "../../../../test/payments/spend";
import { expectEmptyTable } from "../../../../test/summary/frames";
import { PayeesPanes } from "./payees-panes";

const NEW_HEADERS = ["Payee", "Network", "First paid", "Runs", "Spent"];
const HELD_HEADERS = ["Payee", "Quarantined", "Runs", "Blocked", "Paid"];

function pane(name: string) {
    return screen.getByRole("region", { name });
}

describe("PayeesPanes", () => {
    it("lists new payees and quarantined payees", () => {
        render(<PayeesPanes spend={fullSpend()} />);

        const fresh = within(pane("New payees"));
        expect(fresh.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(NEW_HEADERS);
        expect(fresh.getByText("0xaaaa…aaaa").getAttribute("title")).toBe(PAYEE);
        expect(fresh.getByText("Base")).toBeTruthy();
        expect(fresh.getByText("1 Oct").getAttribute("title")).toBe("1 October 2026 at 00:00");
        expect(fresh.getByText("2").getAttribute("title")).toBe("billing, research");
        expect(fresh.getByText("$0.75").getAttribute("title")).toBe("Plus 1 with no known USD value");

        const held = within(pane("Quarantined payees"));
        expect(held.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(HELD_HEADERS);
        expect(held.getByText("0xbbbb…bbbb").getAttribute("title")).toBe(OTHER);
        expect(held.getByText("observe only")).toBeTruthy();
        expect(held.getByText("5")).toBeTruthy();
        expect(held.getByText("$0.01")).toBeTruthy();
    });

    it("has no unknown-value note or observe marker when there is nothing to say", () => {
        const spend = fullSpend();
        render(
            <PayeesPanes
                spend={{
                    ...spend,
                    newPayees: [{ ...spend.newPayees[0], unknown: 0 }],
                    quarantined: [{ ...spend.quarantined[0], observe: false }],
                }}
            />,
        );

        expect(within(pane("New payees")).getByText("$0.75").hasAttribute("title")).toBe(false);
        expect(screen.queryByText("observe only")).toBeNull();
    });

    it("keeps both tables with their headers when there are no payees", () => {
        render(<PayeesPanes spend={emptySpend()} />);

        expectEmptyTable(pane("New payees"), NEW_HEADERS, "No new payee in the last 30 days");
        expectEmptyTable(pane("Quarantined payees"), HELD_HEADERS, "No payee in quarantine");
    });

    it("shows skeleton rows while loading", () => {
        render(<PayeesPanes spend={null} />);

        expect(screen.getAllByRole("status").map((line) => line.textContent)).toEqual([
            "Loading new payees…",
            "Loading quarantined payees…",
        ]);
    });
});

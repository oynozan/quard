import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubBrowser } from "../../../../test/fleet-shell/env";
import { emptySpend, fullSpend } from "../../../../test/payments/spend";
import { expectEmptyChart } from "../../../../test/summary/frames";
import { SpendPanes } from "./spend-panes";

const EMPTY = "No x402 spend in the last 30 days";

function pane(name: string) {
    return within(screen.getByRole("region", { name }));
}

function rankedNames(name: string): string[] {
    fireEvent.click(pane(name).getByRole("button", { name: "Table" }));
    return pane(name)
        .getAllByRole("rowheader")
        .map((cell) => cell.textContent ?? "");
}

beforeEach(stubBrowser);
afterEach(() => vi.unstubAllGlobals());

describe("SpendPanes", () => {
    it("shows spend per day and ranks agents, hosts and payees by spend", () => {
        render(<SpendPanes spend={fullSpend()} />);

        expect(screen.getByRole("heading", { level: 2, name: "x402 spend4" })).toBeTruthy();
        expect(pane("Spend per day").getByRole("img").getAttribute("aria-label")).toBe(
            "x402 spend per day over the last 30 days. Peak $0.50 on 3 Oct, $0.50 today.",
        );
        expect(pane("Spend per day").getByText("$0.75")).toBeTruthy();
        expect(pane("Spend per day").getByText("Value unknown")).toBeTruthy();
        expect(rankedNames("By agent")).toEqual(["billing", "research"]);
        expect(rankedNames("By host")).toEqual(["api.example.com"]);
        // A payee paid only in tokens with no USD value has no bar
        expect(rankedNames("By payee")).toEqual(["0xaaaa…aaaa"]);
    });

    it("leaves out the unknown readout when every payment had a USD value", () => {
        render(<SpendPanes spend={emptySpend({ byDay: [...fullSpend().byDay], totalUsd: 0.75, payments: 2 })} />);

        expect(pane("Spend per day").queryByText("Value unknown")).toBeNull();
    });

    it("keeps every chart drawn and unlit when nothing was paid", () => {
        render(<SpendPanes spend={emptySpend()} />);

        expect(screen.getByRole("heading", { level: 2, name: "x402 spend0" })).toBeTruthy();
        expectEmptyChart("Spend per day", EMPTY);
        expectEmptyChart("By agent", EMPTY);
        expectEmptyChart("By host", EMPTY);
        expectEmptyChart("By payee", EMPTY);
    });

    it("shows every chart loading while the spend is on its way", () => {
        render(<SpendPanes spend={null} />);

        expect(screen.getByRole("heading", { level: 2, name: "x402 spend—" })).toBeTruthy();
        for (const name of ["Spend per day", "By agent", "By host", "By payee"]) {
            expect(screen.getByRole("region", { name }).getAttribute("aria-busy"), name).toBe("true");
        }
    });
});

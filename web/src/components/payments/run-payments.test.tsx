import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makePayment, OTHER } from "../../../test/payments/spend";
import { RunPayments } from "./run-payments";

describe("RunPayments", () => {
    it("draws nothing for a run without payments", () => {
        const { container } = render(<RunPayments payments={[]} />);
        expect(container.innerHTML).toBe("");
    });

    it("lists each payment with amount, host, payee, network, status and transaction", () => {
        render(
            <RunPayments
                payments={[
                    makePayment(),
                    makePayment({
                        stepId: "6".repeat(16),
                        stage: "refused",
                        usd: null,
                        amount: "7",
                        payTo: OTHER,
                        network: "eip155:999",
                        txHash: null,
                        reason: "over_run_limit",
                    }),
                ]}
            />,
        );

        const section = screen.getByRole("region", { name: "Payments" });
        expect(within(section).getByRole("heading", { level: 2 }).textContent).toBe("Payments2");
        expect(
            within(section)
                .getAllByRole("columnheader")
                .map((cell) => cell.textContent),
        ).toEqual(["Payment", "Amount", "Payee", "Network", "Status", "Transaction"]);
        const [, settled, refused] = within(section).getAllByRole("row");
        expect(within(settled).getByText("api.example.com")).toBeTruthy();
        expect(within(settled).getByText("$0.01")).toBeTruthy();
        expect(within(settled).getByText("0xaaaa…aaaa")).toBeTruthy();
        expect(within(settled).getByText("Base").getAttribute("title")).toBe("eip155:8453");
        expect(within(settled).getByText("Settled")).toBeTruthy();
        expect(within(settled).getByRole("link").getAttribute("href")).toContain("https://basescan.org/tx/0x");
        expect(within(refused).getByText("Value unknown")).toBeTruthy();
        expect(within(refused).getByText("eip155:999")).toBeTruthy();
        expect(within(refused).getByText("Refused").closest("[title]")?.getAttribute("title")).toBe("over_run_limit");
        expect(within(refused).getByText("None")).toBeTruthy();
        expect(screen.queryByText(/not delivered/)).toBeNull();
    });

    it("calls out payments that were paid but not delivered first", () => {
        const { rerender } = render(<RunPayments payments={[makePayment({ delivered: false })]} />);
        expect(screen.getByText("1 payment paid, not delivered")).toBeTruthy();
        expect(screen.getByText("Paid, not delivered")).toBeTruthy();

        rerender(
            <RunPayments
                payments={[
                    makePayment({ delivered: false }),
                    makePayment({ stepId: "7".repeat(16), delivered: false }),
                ]}
            />,
        );
        expect(screen.getByText("2 payments paid, not delivered")).toBeTruthy();
    });
});

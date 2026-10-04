import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Payee, PaymentAmount, SpendValue, TxLink } from "./values";

const HASH = "0x" + "f".repeat(64);
const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

describe("SpendValue", () => {
    it("prints known spend, and None before any payment", () => {
        const { rerender } = render(<SpendValue usd={0.004} />);
        expect(screen.getByText("$0.004")).toBeTruthy();

        rerender(<SpendValue />);
        expect(screen.getByText("None").className).toContain("text-ink-absent");
    });

    it("says Unknown when a settled token has no USD value, with the known part on hover", () => {
        const { rerender } = render(<SpendValue usd={1.5} known={false} />);
        expect(screen.getByText("Unknown").getAttribute("title")).toBe("$1.50 plus tokens with no known USD value");

        rerender(<SpendValue known={false} />);
        expect(screen.getByText("Unknown").getAttribute("title")).toBe("No known USD value");
    });
});

describe("Payee", () => {
    it("shortens the address and keeps the full one on hover", () => {
        render(<Payee address={ADDRESS} />);
        expect(screen.getByText("0x1234…5678").getAttribute("title")).toBe(ADDRESS);
    });
});

describe("PaymentAmount", () => {
    it("shows the USD value over the atomic amount", () => {
        render(<PaymentAmount usd={0.01} amount="10000" />);
        expect(screen.getByText("$0.01")).toBeTruthy();
        expect(screen.getByText("10000 atomic").getAttribute("title")).toBe("10000 atomic units");
    });

    it("says the value is unknown for a token with no USD value", () => {
        render(<PaymentAmount usd={null} amount="5" />);
        expect(screen.getByText("Value unknown")).toBeTruthy();
    });
});

describe("TxLink", () => {
    it("links a hash on a known network to its explorer, in a new tab", () => {
        render(<TxLink network="eip155:8453" hash={HASH} />);
        const link = screen.getByRole("link", { name: "0xffff…ffff" });
        expect(link.getAttribute("href")).toBe(`https://basescan.org/tx/${HASH}`);
        expect(link.getAttribute("target")).toBe("_blank");
        expect(link.getAttribute("title")).toBe(HASH);
    });

    it("shows a plain hash on an unknown network, and None without one", () => {
        const { rerender } = render(<TxLink network="eip155:999" hash={HASH} />);
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.getByText("0xffff…ffff").getAttribute("title")).toBe(HASH);

        rerender(<TxLink network="eip155:8453" hash={null} />);
        expect(screen.getByText("None")).toBeTruthy();
    });
});

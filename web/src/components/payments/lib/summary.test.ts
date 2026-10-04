// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PAYEE } from "../../../../test/payments/spend";
import { START_AT } from "../../../../test/summary/fleet";
import { barsSummary, daySummary, spendBars } from "./summary";

describe("spendBars", () => {
    it("keeps spend with a known USD value, biggest first, with payees shortened", () => {
        const items = [
            { label: "a", usd: 0.1, payments: 1, unknown: 0 },
            { label: "b", usd: 0, payments: 1, unknown: 1 },
            { label: PAYEE, usd: 0.5, payments: 1, unknown: 0 },
        ];
        expect(spendBars(items)).toEqual([
            { label: PAYEE, value: 0.5 },
            { label: "a", value: 0.1 },
        ]);
        expect(spendBars(items, true)[0]).toEqual({ label: "0xaaaa…aaaa", value: 0.5 });
    });
});

describe("daySummary", () => {
    it("names the peak day and today", () => {
        const values = Array.from({ length: 30 }, () => 0);
        values[27] = 0.25;
        values[29] = 0.004;
        expect(daySummary(values, START_AT)).toBe(
            "x402 spend per day over the last 30 days. Peak $0.25 on 1 Oct, $0.004 today.",
        );
        expect(daySummary([], START_AT)).toBe("x402 spend per day: none in the last 30 days.");
    });
});

describe("barsSummary", () => {
    it("names the leader", () => {
        expect(barsSummary("Spend by host", [{ label: "a.com", value: 1.5 }])).toBe(
            "Spend by host over the last 30 days. a.com leads with $1.50, out of 1.",
        );
        expect(barsSummary("Spend by host", [])).toBe("Spend by host: none in the last 30 days.");
    });
});

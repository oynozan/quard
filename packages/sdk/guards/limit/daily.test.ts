import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCall } from "../../test/call.ts";
import { addDayUsed, checkDaily, clearDayCounts, dayCounts, dayUsed, noteDayUsed, utcDay } from "./daily.ts";

const NOW = Date.parse("2026-10-03T23:30:00.000Z");

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(() => {
    clearDayCounts();
    vi.useRealTimers();
});

describe("per-day counts", () => {
    it("uses UTC days", () => {
        expect(utcDay()).toBe("2026-10-03");
        expect(utcDay(Date.parse("2026-10-04T00:00:00.000Z"))).toBe("2026-10-04");
    });

    it("keeps the larger count from control, and adds local counts", () => {
        noteDayUsed("2026-10-03", "pay", "calls", 5);
        noteDayUsed("2026-10-03", "pay", "calls", 3);
        addDayUsed("2026-10-03", "pay", "calls", 2);
        addDayUsed("2026-10-03", "pay", "amount:amount", 40);

        expect(dayUsed("2026-10-03", "pay", "calls")).toBe(7);
        expect(dayUsed("2026-10-03", "pay", "amount:amount")).toBe(40);
        expect(dayUsed("2026-10-03", "other", "calls")).toBe(0);
    });

    it("keeps only today and yesterday", () => {
        addDayUsed("2026-10-01", "pay", "calls", 1);
        addDayUsed("2026-10-02", "pay", "calls", 1);
        addDayUsed("2026-10-03", "pay", "calls", 1);

        expect(dayUsed("2026-10-01", "pay", "calls")).toBe(0);
        expect(dayUsed("2026-10-02", "pay", "calls")).toBe(1);
    });

    it("lists the counters a call adds to", () => {
        const call = makeCall({ amount: "12.5" });

        expect(dayCounts(call, { type: "limit" })).toEqual([]);
        expect(
            dayCounts(call, { type: "limit", maxCallsPerDay: 3, maxAmountPerDay: { field: "amount", max: 100 } }),
        ).toEqual([
            { rule: "max-calls-per-day", counter: "calls", add: 1, max: 3, bad: false },
            { rule: "max-amount-per-day", counter: "amount:amount", add: 12.5, max: 100, bad: false },
        ]);
        expect(dayCounts(makeCall({}), { type: "limit", maxAmountPerDay: { field: "amount", max: 1 } })[0]?.add).toBe(
            0,
        );
    });
});

describe("checkDaily", () => {
    const options = { type: "limit" as const, maxCallsPerDay: 2, maxAmountPerDay: { field: "amount", max: 100 } };

    it("allows calls until a per-day cap would be passed", () => {
        const call = makeCall({ amount: 60 });

        expect(checkDaily(call, options, "block").map((result) => result.decision)).toEqual(["allow", "allow"]);
        addDayUsed(utcDay(), call.tool, "calls", 2);
        addDayUsed(utcDay(), call.tool, "amount:amount", 50);

        expect(checkDaily(call, options, "observe")).toEqual([
            {
                guard: "limit",
                rule: "max-calls-per-day",
                decision: "block",
                mode: "observe",
                reason: "daily_limit_reached",
            },
            {
                guard: "limit",
                rule: "max-amount-per-day",
                decision: "block",
                mode: "observe",
                reason: "daily_limit_reached",
            },
        ]);
    });

    it("blocks a negative or broken amount, which could lower the count", () => {
        for (const amount of [-5, "lots"]) {
            const [result] = checkDaily(
                makeCall({ amount }),
                { type: "limit", maxAmountPerDay: { field: "amount", max: 100 } },
                "block",
            );

            expect(result?.decision).toBe("block");
        }
    });
});

import { describe, expect, it } from "vitest";
import { newRun } from "../../context/run.ts";
import { makeAskableCall } from "../../test/call.ts";
import {
    addRunUsed,
    fitsControl,
    isShared,
    markShared,
    noteRunUsed,
    runCounts,
    runTotals,
    runUsed,
} from "./run-counts.ts";

describe("shared runs", () => {
    it("marks a run once", () => {
        const run = newRun();

        expect(isShared(run)).toBe(false);
        expect(markShared(run)).toBe(true);
        expect(markShared(run)).toBe(false);
        expect(isShared(run)).toBe(true);
        expect(isShared(newRun())).toBe(false);
    });

    it("keeps counter names control can't take in this process", () => {
        expect(fitsControl(`calls:${"t".repeat(194)}`)).toBe(true);
        expect(fitsControl(`calls:${"t".repeat(195)}`)).toBe(false);
    });
});

describe("the local view of run counters", () => {
    it("reads and adds to steps, cost and the limit guards' counters", () => {
        const run = newRun();
        addRunUsed(run, "steps", 2);
        addRunUsed(run, "cost", 0.25);
        addRunUsed(run, "calls:pay", 1);
        addRunUsed(run, "calls:pay", 1);

        expect([run.modelCalls, run.costUsd, run.counters.get("calls:pay")]).toEqual([2, 0.25, 2]);
        expect([runUsed(run, "steps"), runUsed(run, "cost"), runUsed(run, "calls:pay")]).toEqual([2, 0.25, 2]);
        expect(runUsed(run, "amount:pay:amount")).toBe(0);
    });

    it("keeps the larger of its own total and control's", () => {
        const run = newRun();
        addRunUsed(run, "steps", 5);
        noteRunUsed(run, "steps", 3);
        noteRunUsed(run, "cost", 1.5);
        noteRunUsed(run, "calls:pay", 7);

        expect([run.modelCalls, run.costUsd, run.counters.get("calls:pay")]).toEqual([5, 1.5, 7]);
    });

    it("lists the totals so far, leaving out empty ones and names control can't take", () => {
        const run = newRun();
        expect(runTotals(run)).toEqual([]);

        run.costUsd = 0.5;
        run.counters.set("calls:pay", 2);
        run.counters.set("amount:pay:amount", 0);
        run.counters.set(`calls:${"t".repeat(200)}`, 1);

        expect(runTotals(run)).toEqual([
            { counter: "cost", add: 0.5 },
            { counter: "calls:pay", add: 2 },
        ]);
    });
});

describe("runCounts", () => {
    it("names the per-run counters a call adds to, with each guard's cap", () => {
        const call = makeAskableCall({ amount: 80 });

        expect(runCounts(call, { type: "limit" })).toEqual([]);
        expect(
            runCounts(call, { type: "limit", maxCallsPerRun: 3, maxAmountPerRun: { field: "amount", max: 100 } }),
        ).toEqual([
            { rule: "max-calls-per-run", counter: "calls:payInvoice", add: 1, max: 3 },
            { rule: "max-amount-per-run", counter: "amount:payInvoice:amount", add: 80, max: 100 },
        ]);
    });

    it("adds nothing for a missing, negative or broken amount", () => {
        const options = { type: "limit" as const, maxAmountPerRun: { field: "amount", max: 100 } };
        const adds = [{}, { amount: -5 }, { amount: Number.NaN }].map(
            (input) => runCounts(makeAskableCall(input), options)[0]?.add,
        );

        expect(adds).toEqual([0, 0, 0]);
    });
});

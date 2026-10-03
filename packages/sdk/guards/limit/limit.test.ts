import { afterEach, describe, expect, it } from "vitest";
import { configure, resetConfig } from "../../core/config.ts";
import { makeCall } from "../../test/call.ts";
import { checkLimit, countLimit, limitRules } from "./limit.ts";

afterEach(() => {
    resetConfig();
});

describe("checkLimit", () => {
    it("allows calls until the per-run count is reached", () => {
        const options = { type: "limit" as const, maxCallsPerRun: 2 };
        const call = makeCall({});

        expect(checkLimit(call, options)[0]?.decision).toBe("allow");
        countLimit(call, options);
        countLimit(call, options);

        expect(checkLimit(call, options)).toEqual([
            { guard: "limit", rule: "max-calls-per-run", decision: "block", mode: "block", reason: "limit_reached" },
        ]);
    });

    it("sums amounts per run", () => {
        const options = {
            type: "limit" as const,
            mode: "observe" as const,
            maxAmountPerRun: { field: "amount", max: 100 },
        };
        const first = makeCall({ amount: 60 });

        expect(checkLimit(first, options)[0]?.decision).toBe("allow");
        countLimit(first, options);

        const second = { ...first, input: { amount: 50 } };
        expect(checkLimit(second, options)[0]).toMatchObject({
            rule: "max-amount-per-run",
            decision: "block",
            mode: "observe",
        });
    });

    it("counts a missing amount as zero and blocks a bad amount", () => {
        const options = { type: "limit" as const, maxAmountPerRun: { field: "amount", max: 10 } };
        const call = makeCall({});
        countLimit(call, options);

        expect(checkLimit(call, options)[0]?.decision).toBe("allow");
        expect(checkLimit({ ...call, input: { amount: "lots" } }, options)[0]?.decision).toBe("block");
    });

    it("blocks negative amounts and never lets them lower the count", () => {
        const enforced = { type: "limit" as const, maxAmountPerRun: { field: "amount", max: 100 } };
        const observed = { ...enforced, mode: "observe" as const };
        const call = makeCall({ amount: -1_000_000 });

        expect(checkLimit(call, enforced)[0]?.decision).toBe("block");
        countLimit(call, observed);
        countLimit({ ...call, input: { amount: "lots" } }, observed);

        expect(checkLimit({ ...call, input: { amount: 90 } }, enforced)[0]?.decision).toBe("allow");
        expect(call.run.counters.get("amount:testTool:amount")).toBe(0);
    });

    it("checks delegation in the run limits' mode, next to its own limits", () => {
        const options = { type: "limit" as const, maxCallsPerRun: 1, delegateTo: "to" };
        const call = { ...makeCall({ to: "billing" }), depth: 3 };

        expect(checkLimit(call, options).map((r) => [r.rule, r.decision, r.mode])).toEqual([
            ["max-calls-per-run", "allow", "block"],
            ["max-depth", "block", "observe"],
            ["max-fan-out", "allow", "observe"],
            ["max-loops", "allow", "observe"],
        ]);

        configure({ runLimits: { mode: "block" } });
        expect(checkLimit(call, options)[1]).toMatchObject({ rule: "max-depth", mode: "block" });
    });

    it("counts the helper of a delegation", () => {
        const call = makeCall({ to: "billing" });

        countLimit(call, { type: "limit", delegateTo: "to" });

        expect(call.run.helpers.get("default")).toEqual(new Set(["billing"]));
    });

    it("does nothing without limits", () => {
        const call = makeCall({});
        countLimit(call, { type: "limit" });

        expect(checkLimit(call, { type: "limit" })).toEqual([]);
        expect(call.run.counters.size).toBe(0);
    });
});

describe("countLimit", () => {
    it("can take a count back", () => {
        const options = { type: "limit" as const, maxCallsPerRun: 5, maxAmountPerRun: { field: "amount", max: 100 } };
        const call = makeCall({ amount: 30 });
        countLimit(call, options);

        const takeBack = countLimit(call, options);
        takeBack();

        expect([...call.run.counters.values()]).toEqual([1, 30]);
    });

    it("takes a delegation back too, when control stops the call", () => {
        const call = makeCall({ to: "billing" });

        countLimit(call, { type: "limit", delegateTo: "to" })();

        expect(call.run.helpers.get("default")).toEqual(new Set());
        expect(call.run.turns.size).toBe(0);
    });

    it("counts only delegation when control keeps the run's counters", () => {
        const call = makeCall({ to: "billing", amount: 30 });
        const options = {
            type: "limit" as const,
            maxCallsPerRun: 5,
            maxAmountPerRun: { field: "amount", max: 100 },
            delegateTo: "to",
        };

        countLimit(call, options, false);

        expect(call.run.counters.size).toBe(0);
        expect(call.run.helpers.get("default")).toEqual(new Set(["billing"]));
    });
});

describe("limitRules", () => {
    it("names the rules a limit guard has", () => {
        expect(limitRules({ type: "limit" })).toEqual([]);
        expect(
            limitRules({
                type: "limit",
                maxCallsPerRun: 1,
                maxAmountPerRun: { field: "a", max: 1 },
                maxCallsPerDay: 1,
                maxAmountPerDay: { field: "a", max: 1 },
                fleetCheck: ["iban"],
            }),
        ).toEqual([
            "max-calls-per-run",
            "max-amount-per-run",
            "max-calls-per-day",
            "max-amount-per-day",
            "fleet-check",
        ]);
    });
});

import { describe, expect, it } from "vitest";
import { makeCall } from "../../test/call.ts";
import { checkLimit, countLimit } from "./limit.ts";

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

    it("does nothing without limits", () => {
        const call = makeCall({});
        countLimit(call, { type: "limit" });

        expect(checkLimit(call, { type: "limit" })).toEqual([]);
        expect(call.run.counters.size).toBe(0);
    });
});

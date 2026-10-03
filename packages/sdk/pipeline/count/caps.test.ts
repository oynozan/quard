import { afterEach, describe, expect, it } from "vitest";
import { takeEvents } from "../../core/recorder.ts";
import type { LimitOptions } from "../../guards/options.ts";
import { makeAskableCall } from "../../test/call.ts";
import { decisionsOf } from "../../test/events.ts";
import { resetAll } from "../../test/reset.ts";
import { countersOf, enforcedCap, refusal } from "./caps.ts";

afterEach(() => {
    resetAll();
});

describe("countersOf", () => {
    it("joins the caps of guards on one counter and leaves out counters that add nothing", () => {
        const limits: LimitOptions[] = [{ type: "limit" }, { type: "limit", mode: "observe" }];
        const counters = countersOf(limits, (options) => [
            { rule: "a", counter: "calls", add: 1, max: options.mode === undefined ? 3 : 5 },
            { rule: "b", counter: "amount:amount", add: 0, max: 10 },
        ]);

        expect(counters).toEqual([
            {
                counter: "calls",
                add: 1,
                caps: [
                    { rule: "a", max: 3, mode: "block" },
                    { rule: "a", max: 5, mode: "observe" },
                ],
            },
        ]);
        expect(enforcedCap(counters[0] as (typeof counters)[0])).toBe(3);
        expect(enforcedCap({ counter: "calls", add: 1, caps: [{ rule: "a", max: 5, mode: "observe" }] })).toBe(
            undefined,
        );
    });
});

describe("refusal", () => {
    it("records with the reason it is given", () => {
        const call = makeAskableCall({});

        expect(refusal(call, [{ rule: "max-calls-per-run", max: 1, mode: "block" }], [], "limit_reached")).toEqual({
            guard: "limit",
            rule: "max-calls-per-run",
            decision: "block",
            mode: "block",
            reason: "limit_reached",
        });
        expect(decisionsOf(takeEvents()).map((event) => event.reason)).toEqual(["limit_reached"]);
    });
});

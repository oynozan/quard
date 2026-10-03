import { describe, expect, it } from "vitest";
import { DEFAULT_RUN_LIMITS, type RunLimits } from "../../core/config.ts";
import { makeCall } from "../../test/call.ts";
import type { GuardCall } from "../call.ts";
import { checkDelegation, countDelegation } from "./delegation.ts";

const LIMITS: RunLimits = { ...DEFAULT_RUN_LIMITS, mode: "block" };

function over(call: GuardCall, limits: RunLimits = LIMITS): string[] {
    return checkDelegation(call, "to", limits)
        .filter((result) => result.decision === "block")
        .map((result) => result.rule);
}

// One call from `from` to `to`, sharing the run of `base`
function handoff(base: GuardCall, from: string, to: string): GuardCall {
    return { ...base, agent: from, input: { to } };
}

describe("checkDelegation", () => {
    it("allows a first handoff and reports every rule in the limits' mode", () => {
        const call = makeCall({ to: "billing" });

        expect(checkDelegation(call, "to", { ...LIMITS, mode: "observe" })).toEqual([
            { guard: "limit", rule: "max-depth", decision: "allow", mode: "observe" },
            { guard: "limit", rule: "max-fan-out", decision: "allow", mode: "observe" },
            { guard: "limit", rule: "max-loops", decision: "allow", mode: "observe" },
        ]);
    });

    it("blocks a handoff that would go deeper than the depth limit", () => {
        const call = makeCall({ to: "helper" });

        expect(over({ ...call, depth: 2 })).toEqual([]);
        expect(checkDelegation({ ...call, depth: 3 }, "to", LIMITS)[0]).toEqual({
            guard: "limit",
            rule: "max-depth",
            decision: "block",
            mode: "block",
            reason: "limit_reached",
        });
    });

    it("checks only depth when the argument names no agent", () => {
        const call = makeCall({ to: "" });

        expect(checkDelegation(call, "to", LIMITS).map((result) => result.rule)).toEqual(["max-depth"]);
        expect(checkDelegation({ ...call, input: { to: 7 } }, "to", LIMITS)).toHaveLength(1);
        expect(checkDelegation({ ...call, input: "billing" }, "to", LIMITS)).toHaveLength(1);
    });

    it("reads a nested argument", () => {
        const call = makeCall({ message: { to: "billing" } });

        expect(checkDelegation(call, "message.to", LIMITS)).toHaveLength(3);
    });

    it("blocks a new helper past the fan-out limit, but not a helper already used", () => {
        const base = makeCall({});
        const limits = { ...LIMITS, fanOut: 2 };
        countDelegation(handoff(base, "boss", "a"), "to");
        countDelegation(handoff(base, "boss", "b"), "to");

        expect(over(handoff(base, "boss", "a"), limits)).toEqual([]);
        expect(over(handoff(base, "boss", "c"), limits)).toEqual(["max-fan-out"]);
        // Fan-out is counted per agent
        expect(over(handoff(base, "other", "c"), limits)).toEqual([]);
    });

    it("counts a turn for each change of direction between two agents", () => {
        const base = makeCall({});
        const limits = { ...LIMITS, loops: 3 };
        countDelegation(handoff(base, "a", "b"), "to");
        countDelegation(handoff(base, "a", "b"), "to");
        // A to B twice is still one turn
        expect(base.run.turns.get(JSON.stringify(["a", "b"]))).toEqual({ lastFrom: "a", turns: 1 });

        countDelegation(handoff(base, "b", "a"), "to");
        countDelegation(handoff(base, "a", "b"), "to");
        expect(over(handoff(base, "a", "b"), limits)).toEqual([]);
        expect(over(handoff(base, "b", "a"), limits)).toEqual(["max-loops"]);
        // Other pairs keep their own count
        expect(over(handoff(base, "b", "c"), limits)).toEqual([]);
    });
});

describe("countDelegation", () => {
    it("records the helper and the turn", () => {
        const call = makeCall({ to: "billing" });

        countDelegation(call, "to");

        expect(call.run.helpers.get("default")).toEqual(new Set(["billing"]));
        expect(call.run.turns.get(JSON.stringify(["billing", "default"]))).toEqual({ lastFrom: "default", turns: 1 });
    });

    it("records nothing when the argument names no agent", () => {
        const call = makeCall({});

        expect(countDelegation(call, "to")).toBeUndefined();

        expect(call.run.helpers.size).toBe(0);
        expect(call.run.turns.size).toBe(0);
    });

    it("takes a first handoff back completely", () => {
        const call = makeCall({ to: "billing" });

        countDelegation(call, "to")?.();

        expect(call.run.helpers.get("default")).toEqual(new Set());
        expect(call.run.turns.size).toBe(0);
    });

    it("takes back only what a later handoff added", () => {
        const base = makeCall({});
        const key = JSON.stringify(["a", "b"]);
        countDelegation(handoff(base, "a", "b"), "to");

        // The helper was already counted, so taking B back to A keeps it
        countDelegation(handoff(base, "b", "a"), "to")?.();
        countDelegation(handoff(base, "a", "b"), "to")?.();

        expect(base.run.helpers.get("a")).toEqual(new Set(["b"]));
        expect(base.run.helpers.get("b")).toEqual(new Set());
        expect(base.run.turns.get(key)).toEqual({ lastFrom: "a", turns: 1 });
    });
});

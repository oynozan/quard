import { afterEach, describe, expect, it, vi } from "vitest";
import { configure } from "../core/config.ts";
import { registerGuardedTool } from "../context/registry.ts";
import type { FailResult, RuleResult } from "../guards/call.ts";
import type { GuardOptions } from "../guards/options.ts";
import { rulesSnapshot } from "../policy/rules.ts";
import { makeCall } from "../test/call.ts";
import { resetAll } from "../test/reset.ts";
import { asksOf, askTimeout, decide, preChecks, recordDecision } from "./checks.ts";

afterEach(() => {
    resetAll();
});

const result = (decision: RuleResult["decision"], mode: RuleResult["mode"] = "block"): RuleResult =>
    decision === "allow"
        ? { guard: "action", rule: decision, decision, mode }
        : { guard: "action", rule: decision, decision, mode, reason: "rule_failed" };

describe("preChecks", () => {
    const list: GuardOptions[] = [
        { type: "approval" },
        { type: "egress", allow: ["acme.com"] },
        { type: "action", rules: [{ field: "amount", max: 10 }] },
        { type: "limit", maxCallsPerRun: 5 },
        { type: "source", origin: "web" },
    ];

    it("runs limit, action, egress and approval in that order", () => {
        const call = makeCall({ to: "a@acme.com", amount: 1 });

        expect(preChecks(call, list, true).map((r) => r.guard)).toEqual([
            "limit",
            "action",
            "egress",
            "egress",
            "approval",
        ]);
    });

    it("can leave approval out", () => {
        expect(preChecks(makeCall({}), list, false).map((r) => r.guard)).not.toContain("approval");
        expect(preChecks(makeCall({}), [{ type: "limit" }], true)).toEqual([]);
    });
});

describe("decide", () => {
    it("picks block over ask over allow", () => {
        expect(decide([result("allow"), result("ask"), result("block")])?.decision).toBe("block");
        expect(decide([result("allow"), result("ask")])?.decision).toBe("ask");
        expect(decide([result("allow")])).toBeUndefined();
    });

    it("ignores rules in observe mode", () => {
        expect(decide([result("block", "observe"), result("ask", "observe")])).toBeUndefined();
    });
});

describe("asksOf", () => {
    it("keeps the enforced asks", () => {
        const asks = asksOf([result("allow"), result("ask"), result("ask", "observe"), result("block")]);

        expect(asks).toEqual([result("ask")]);
    });
});

describe("ask timeouts", () => {
    it("mark each guard's asks with that guard's timeout", () => {
        const call = makeCall({ to: "x@other.com", amount: 50 }, [["user", "send it"]]);
        const timed: GuardOptions[] = [
            { type: "approval", timeout: 60 },
            { type: "action", rules: [{ field: "amount", max: 10, onFail: "ask" }], timeout: 5 },
            { type: "action", rules: [{ field: "amount", max: 100, onFail: "ask" }], timeout: 1 },
            { type: "egress", allow: ["acme.com"], onFail: "ask", timeout: 30 },
        ];
        const results = preChecks(call, timed, true);

        expect(asksOf(results).map((ask) => [ask.guard, ask.timeout])).toEqual([
            ["action", 5],
            ["egress", 30],
            ["approval", 60],
        ]);
        expect(results.filter((r) => r.decision === "allow").some((r) => "timeout" in r)).toBe(false);
    });

    it("wait at most the shortest one, and with no limit when no guard set one", () => {
        const ask = (timeout?: number): FailResult => ({ ...(result("ask") as FailResult), timeout });

        expect(askTimeout([ask(), ask(30), ask(5)])).toBe(5);
        expect(askTimeout([ask()])).toBeUndefined();
        expect(askTimeout([])).toBeUndefined();
    });
});

describe("recordDecision", () => {
    it("records enforced and observed decisions", () => {
        const onEvent = vi.fn();
        configure({ onEvent });
        const call = makeCall({});

        recordDecision(call, {
            guard: "action",
            rule: "cap",
            decision: "block",
            mode: "block",
            reason: "amount_over_cap",
            field: "amount",
        });
        recordDecision(call, result("ask", "observe"));

        expect(onEvent.mock.calls.map(([event]) => [event.decision, event.enforced, event.reason])).toEqual([
            ["block", true, "amount_over_cap"],
            ["ask", false, "rule_failed"],
        ]);
    });

    it("adds the rules hash once a guarded tool exists, and the approval request", () => {
        const onEvent = vi.fn();
        configure({ onEvent });
        const call = makeCall({});
        const request = `apr_${"1".repeat(16)}`;

        recordDecision(call, result("allow"));
        registerGuardedTool("pay", [{ type: "approval" }]);
        recordDecision(call, { guard: "approval", rule: "human", decision: "allow", mode: "block", request });

        expect(onEvent.mock.calls.map(([event]) => [event.rules, event.request])).toEqual([
            [undefined, undefined],
            [rulesSnapshot().hash, request],
        ]);
    });
});

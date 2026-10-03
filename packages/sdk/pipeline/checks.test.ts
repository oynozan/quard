import { afterEach, describe, expect, it, vi } from "vitest";
import { configure } from "../core/config.ts";
import { registerGuardedTool } from "../context/registry.ts";
import type { RuleResult } from "../guards/call.ts";
import type { GuardOptions } from "../guards/options.ts";
import { rulesSnapshot } from "../policy/rules.ts";
import { makeCall } from "../test/call.ts";
import { resetAll } from "../test/reset.ts";
import { asksOf, decide, preChecks, recordDecision } from "./checks.ts";

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

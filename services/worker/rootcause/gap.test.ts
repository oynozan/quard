import { describe, expect, it } from "vitest";
import { attackRun, decision, IBAN_KEY, step, STEP } from "../test/runs.ts";
import { stepEntry, type Entry } from "./entry.ts";
import { missingGuard } from "./gap.ts";

const ran = step({ stepId: STEP.pay, kind: "tool_call", name: "payInvoice" });
const checked = [decision({ stepId: STEP.pay, tool: "payInvoice", guard: "egress", rule: "egress" })];
const web: Entry = {
    ...stepEntry(ran, "web:invoices.evil-pay.com"),
    trust: "untrusted",
    contentId: "c2",
    key: IBAN_KEY,
};
const none = { tool: "payInvoice", guard: null, rule: null, observe: false };

describe("missingGuard", () => {
    it("is null when a guard blocked the call", () => {
        const blocked = attackRun().steps.find((item) => item.stepId === STEP.pay);

        expect(blocked && missingGuard(blocked, attackRun().decisions, web)).toBeNull();
    });

    it("names the rule in observe mode", () => {
        const observed = decision({ stepId: STEP.pay, tool: "payInvoice", guard: "approval", rule: "pay-big" });

        expect(missingGuard(ran, [{ ...observed, decision: "ask", mode: "observe", enforced: false }], web)).toEqual({
            text: 'The approval rule "pay-big" on payInvoice is in observe mode, so it only recorded "would ask"',
            tool: "payInvoice",
            guard: "approval",
            rule: "pay-big",
            observe: true,
        });
    });

    it("names the kind of value no rule checks when untrusted content carried it", () => {
        expect(missingGuard(ran, checked, web)).toEqual({
            ...none,
            text: "No rule on payInvoice checks where the iban comes from",
        });
    });

    it.each([
        ["untrusted content held no value of the call", { ...web, key: null }],
        ["the content was trusted", { ...web, trust: "trusted" as const }],
    ])("says no rule stopped the call when %s", (_what, entry) => {
        expect(missingGuard(ran, checked, entry)).toEqual({ ...none, text: "No rule on payInvoice stopped this call" });
    });

    it("says when the tool has no guard that checks its arguments", () => {
        expect(missingGuard(ran, [], web)).toEqual({
            ...none,
            text: "payInvoice has no action, egress or approval guard",
        });
    });

    it("ignores decisions about other calls", () => {
        const elsewhere = decision({ stepId: STEP.fetch, tool: "fetchPage", decision: "block" });

        expect(missingGuard(ran, [...checked, elsewhere], web)?.text).toBe(
            "No rule on payInvoice checks where the iban comes from",
        );
    });
});

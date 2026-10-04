import { describe, expect, it } from "vitest";
import { at, attackRun, changeStep, decision, step, STEP } from "../test/runs.ts";
import { ASKED_ONLY, damageOf, NEVER_ARRIVED, PAID_OUTSIDE, RUN_LIMIT, type Damage } from "./damage.ts";
import type { StoredRun } from "./run.ts";
import { verdictOf } from "./verdict.ts";

// The step id the x402 guard gives a payment, which is never a step
const PAYMENT = "e".repeat(16);
const payment = decision({
    stepId: PAYMENT,
    tool: "wallet",
    guard: "x402",
    rule: "untrusted",
    decision: "block",
    mode: "observe",
    enforced: false,
    at: at(70),
});
// A guarded tool that paid while it ran, from 60 to 80 ms
const fetchPaid = step({
    stepId: "f".repeat(16),
    kind: "tool_call",
    name: "fetchPaid",
    callId: "call_3_0",
    at: at(80),
    durationMs: 20,
});
const runLimit = decision({
    stepId: "d".repeat(16),
    tool: "gpt-5-nano",
    guard: "limit",
    rule: "max-steps",
    decision: "block",
});
const asked = decision({ stepId: STEP.decide, tool: "payInvoice", rule: "requested-call", decision: "block" });

// The attack run where nothing blocked the payment, so it ran
const allowed = (): StoredRun => ({
    ...changeStep(attackRun(), STEP.pay, { status: "ok" }),
    decisions: attackRun().decisions.filter((item) => item.decision !== "block"),
});

function found(damage: Damage | string): Damage {
    if (typeof damage === "string") {
        throw new Error(damage);
    }
    return damage;
}

describe("damageOf", () => {
    it("finds the blocked payment of the M1 attack and leaves its decisions as they are", () => {
        const damage = found(damageOf(attackRun()));

        expect(damage.step.stepId).toBe(STEP.pay);
        expect(damage.run).toEqual(attackRun());
    });

    it("finds a call that ran by the block a rule in observe mode recorded", () => {
        expect(found(damageOf(attackRun("observe"))).step).toMatchObject({ stepId: STEP.pay, status: "ok" });
    });

    it("takes the first blocked tool call, even with no decision on it", () => {
        const run = changeStep(changeStep(allowed(), STEP.fetch, { status: "blocked" }), STEP.pay, {
            status: "blocked",
        });

        expect(found(damageOf(run)).step.stepId).toBe(STEP.fetch);
    });

    it("moves a payment's block onto the agent's tool call that was running then", () => {
        const allow = { ...payment, rule: "max-per-payment", decision: "allow" };
        const damage = found(damageOf({ steps: [fetchPaid], labels: [], decisions: [allow, payment] }));

        expect(damage.step).toBe(fetchPaid);
        expect(damage.run.decisions).toEqual([allow, { ...payment, stepId: fetchPaid.stepId }]);
    });

    it("names the x402 rule in observe mode as the missing guard of the tool call that paid", () => {
        const damage = found(damageOf({ steps: [fetchPaid], labels: [], decisions: [payment] }));

        expect(verdictOf(damage.run, damage.step)).toMatchObject({
            damage: { stepId: fetchPaid.stepId, tool: "fetchPaid", ran: true },
            missingGuard: { tool: "fetchPaid", guard: "x402", rule: "untrusted", observe: true },
        });
    });

    it("takes the innermost of two tool calls running when the payment was checked", () => {
        const outer = step({ stepId: "a".repeat(16), kind: "tool_call", name: "research", at: at(90), durationMs: 40 });

        expect(found(damageOf({ steps: [fetchPaid, outer], labels: [], decisions: [payment] })).step).toBe(fetchPaid);
    });

    it("says a payment was checked outside a guarded tool when no tool call of the agent ran then", () => {
        const steps = [
            { ...fetchPaid, agent: "helper" },
            step({ stepId: "b".repeat(16), kind: "tool_call", name: "fetchPage", at: at(65) }),
            step({ stepId: "c".repeat(16), kind: "tool_call", name: "fetchPage", at: at(90), durationMs: 10 }),
        ];

        expect(damageOf({ steps, labels: [], decisions: [payment] })).toBe(PAID_OUTSIDE);
    });

    it("moves a refused requested call onto the tool call with its call id", () => {
        const damage = found(damageOf({ ...allowed(), decisions: [asked] }));

        expect(damage.step.stepId).toBe(STEP.pay);
        expect(damage.run.decisions).toEqual([{ ...asked, stepId: STEP.pay }]);
    });

    it("falls back to the agent's next call of the tool when no call id matches", () => {
        const run = changeStep(allowed(), STEP.pay, { callId: null });

        expect(found(damageOf({ ...run, decisions: [asked] })).step.stepId).toBe(STEP.pay);
    });

    it("says no guarded tool call followed a refused requested call", () => {
        const run = allowed();
        const steps = run.steps.filter((item) => item.stepId !== STEP.pay);

        expect(damageOf({ ...run, steps, decisions: [asked] })).toBe(ASKED_ONLY);
    });

    it("says a run limit stopped a model call, sent or not", () => {
        expect(damageOf({ ...allowed(), decisions: [runLimit] })).toBe(RUN_LIMIT);

        const observed = { ...runLimit, stepId: STEP.end, rule: "max-cost", mode: "observe" as const };
        expect(damageOf({ ...allowed(), decisions: [observed] })).toBe(RUN_LIMIT);
    });

    it("says the blocked call's events never arrived when its tool call is missing", () => {
        const run = attackRun();
        const steps = run.steps.filter((item) => item.stepId !== STEP.pay);

        expect(damageOf({ ...run, steps })).toBe(NEVER_ARRIVED);
        expect(damageOf({ ...run, steps, decisions: [runLimit, ...run.decisions] })).toBe(NEVER_ARRIVED);
        expect(damageOf({ ...run, steps, decisions: [] })).toBe(NEVER_ARRIVED);
    });

    it("gives the reason of the earliest block", () => {
        const run = { steps: [], labels: [] };

        expect(damageOf({ ...run, decisions: [runLimit, payment] })).toBe(RUN_LIMIT);
        expect(damageOf({ ...run, decisions: [payment, runLimit] })).toBe(PAID_OUTSIDE);
    });
});

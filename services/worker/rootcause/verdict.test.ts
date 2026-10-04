import { describe, expect, it } from "vitest";
import { at, attackRun, changeStep, decision, IBAN_KEY, label, OTHER_IBAN_KEY, step, STEP } from "../test/runs.ts";
import type { StoredRun } from "./run.ts";
import { findVerdict } from "./verdict.ts";

// The attack run with the payment asking for an IBAN that appears nowhere
const inventedIban = (run: StoredRun) => changeStep(run, STEP.pay, { detail: { keys: [OTHER_IBAN_KEY] } });

describe("findVerdict", () => {
    it("names the web page, the model call and the blocked payment in the M1 attack", () => {
        expect(findVerdict(attackRun(), STEP.pay)).toEqual({
            category: "bad input",
            entry: {
                stepId: STEP.fetch,
                agent: "billing",
                at: at(58).toISOString(),
                origin: "web:invoices.evil-pay.com",
                trust: "untrusted",
                sensitivity: "public",
                flags: ["instructions"],
                contentId: "c2",
                key: IBAN_KEY,
            },
            turning: { stepId: STEP.decide, agent: "billing", at: at(59).toISOString() },
            damage: { stepId: STEP.pay, agent: "billing", at: at(60).toISOString(), tool: "payInvoice", ran: false },
            missingGuard: null,
            values: [
                {
                    key: IBAN_KEY,
                    generated: false,
                    appearances: [
                        expect.objectContaining({ contentId: "c2", match: "value", at: at(58).toISOString() }),
                    ],
                },
            ],
            versions: [],
        });
    });

    it("names the rule in observe mode when the payment ran", () => {
        expect(findVerdict(attackRun("observe"), STEP.pay)).toMatchObject({
            category: "bad input",
            damage: { ran: true },
            missingGuard: {
                text: 'The action rule "iban:from" on payInvoice is in observe mode, so it only recorded "would block"',
                tool: "payInvoice",
                guard: "action",
                rule: "iban:from",
                observe: true,
            },
        });
    });

    it("finds nothing for a step that is not a tool call of the run", () => {
        expect(findVerdict(attackRun(), STEP.decide)).toBeUndefined();
        expect(findVerdict(attackRun(), "0000000000000000")).toBeUndefined();
    });

    it("blames the model's reasoning when a blocked value came from nowhere and nothing untrusted was read", () => {
        const run = inventedIban(attackRun());
        const verdict = findVerdict(
            { ...run, labels: run.labels.filter((item) => item.trust === "trusted") },
            STEP.pay,
        );

        expect(verdict).toMatchObject({
            category: "bad reasoning",
            entry: { stepId: STEP.decide, origin: "agent:billing", trust: "trusted", contentId: null, key: null },
            missingGuard: null,
            values: [{ key: OTHER_IBAN_KEY, generated: true, appearances: [] }],
        });
    });

    it("points to flagged content the agent read when no value of the call came from it", () => {
        const run = inventedIban(attackRun());
        const plain = label({ contentId: "c0", stepId: STEP.fetch, origin: "web:news.example", trust: "untrusted" });
        const verdict = findVerdict({ ...run, labels: [plain, ...run.labels] }, STEP.pay);

        expect(verdict).toMatchObject({ category: "bad input", entry: { contentId: "c2", key: null } });
    });

    it("blames a missing guard when a payment to a known supplier ran past its checks", () => {
        const supplier = label({ contentId: "c4", stepId: STEP.fetch, origin: "tool:getSupplier", keys: [IBAN_KEY] });
        const run = changeStep(attackRun(), STEP.pay, { status: "ok" });
        const verdict = findVerdict(
            {
                ...run,
                labels: [supplier],
                decisions: [decision({ stepId: STEP.pay, tool: "payInvoice", guard: "action", rule: "iban:from" })],
            },
            STEP.pay,
        );

        expect(verdict).toMatchObject({
            category: "missing guard",
            entry: { contentId: "c4", origin: "tool:getSupplier", key: IBAN_KEY },
            missingGuard: { text: "No rule on payInvoice stopped this call", guard: null, observe: false },
        });
    });

    it("blames a tool that failed before the model asked for the call", () => {
        const failed = step({ stepId: "aaaaaaaaaaaaaaaa", kind: "tool_call", name: "getSupplier", status: "error" });
        const run = changeStep(inventedIban(attackRun()), STEP.pay, { status: "ok" });
        const verdict = findVerdict(
            {
                steps: [failed, ...run.steps],
                labels: [],
                decisions: [decision({ stepId: STEP.pay, tool: "payInvoice", guard: "limit", rule: "limit" })],
            },
            STEP.pay,
        );

        expect(verdict).toMatchObject({
            category: "broken tool",
            entry: { stepId: failed.stepId, origin: "tool:getSupplier", trust: "trusted", key: null },
            missingGuard: { text: "payInvoice has no action, egress or approval guard" },
        });
    });

    it("takes the agent's last model call before a call that has no call id", () => {
        const run = changeStep(attackRun(), STEP.pay, { callId: null });

        expect(findVerdict(run, STEP.pay)?.turning.stepId).toBe(STEP.decide);
    });

    it("uses the call itself as the turning point when no model call came before it", () => {
        const run = attackRun();
        const alone = { ...run, steps: run.steps.filter((item) => item.kind === "tool_call") };

        expect(findVerdict(alone, STEP.pay)).toMatchObject({
            turning: { stepId: STEP.pay },
            entry: { contentId: "c2" },
        });
    });

    it("counts a call that an enforced guard sent to a person as stopped", () => {
        const run = changeStep(attackRun(), STEP.pay, { status: "ok" });
        const asked = decision({ stepId: STEP.pay, tool: "payInvoice", guard: "approval", rule: "approval" });
        const verdict = findVerdict({ ...run, decisions: [{ ...asked, decision: "ask" }] }, STEP.pay);

        expect(verdict).toMatchObject({ category: "bad input", damage: { ran: true }, missingGuard: null });
    });

    it("names the agent version of each agent's latest model call up to the turning point", () => {
        const researcher = (stepId: string, ms: number, version: string) =>
            step({
                stepId,
                kind: "model_call",
                name: "test-model",
                agent: "researcher",
                at: at(ms),
                detail: { agentVersion: version },
            });
        const run = [STEP.ask, STEP.decide, STEP.end].reduce(
            (sum, stepId, i) => changeStep(sum, stepId, { detail: { agentVersion: `b${i}` } }),
            attackRun(),
        );
        const verdict = findVerdict(
            {
                ...run,
                steps: [
                    researcher("aaaaaaaaaaaaaaaa", 50, "r1"),
                    researcher("bbbbbbbbbbbbbbbb", 70, "r2"),
                    ...run.steps,
                ],
                labels: run.labels.map((item) => (item.contentId === "c2" ? { ...item, agent: "researcher" } : item)),
            },
            STEP.pay,
        );

        expect(verdict?.entry.agent).toBe("researcher");
        expect(verdict?.versions).toEqual([
            { agent: "researcher", version: "r1" },
            { agent: "billing", version: "b1" },
        ]);
    });

    it("leaves out content stored while the turning call ran, unless it was that call's own input", () => {
        const run = changeStep(attackRun(), STEP.decide, { durationMs: 5 });
        const during = {
            ...run,
            labels: run.labels.map((item) => (item.contentId === "c2" ? { ...item, at: at(57) } : item)),
        };

        expect(findVerdict(during, STEP.pay)).toMatchObject({ values: [{ generated: true }] });

        const own = { ...during, labels: during.labels.map((item) => ({ ...item, stepId: STEP.decide })) };
        expect(findVerdict(own, STEP.pay)).toMatchObject({
            values: [{ generated: false }],
            entry: { contentId: "c2" },
        });
    });
});

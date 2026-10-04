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
            acrossAgents: null,
            handoffFault: null,
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
                messages: [],
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

describe("findVerdict for damage that is not a harmful tool call", () => {
    const flag = { stepId: STEP.fetch, tool: "fetchPage", guard: "source", rule: "source", decision: "flag" };
    // The attack run with only the source scan's flag on the fetched page
    const flagged = (mode: "block" | "observe" = "block") => ({
        ...attackRun(),
        decisions: [decision({ ...flag, mode, enforced: mode === "block", reason: "instructions" })],
    });

    it("names the flagged page as the entry and the call that fetched it as the damage", () => {
        expect(findVerdict(flagged(), STEP.fetch, "detection")).toMatchObject({
            category: "bad input",
            entry: { stepId: STEP.fetch, origin: "web:invoices.evil-pay.com", contentId: "c2", key: null },
            turning: { stepId: STEP.ask },
            damage: { stepId: STEP.fetch, tool: "fetchPage", ran: true, kind: "detection" },
            missingGuard: null,
            handoffFault: null,
        });
    });

    it("names the content rule in observe mode", () => {
        expect(findVerdict(flagged("observe"), STEP.fetch, "detection")?.missingGuard).toEqual({
            text: 'The source rule "source" on fetchPage is in observe mode, so it only recorded "would flag"',
            tool: "fetchPage",
            guard: "source",
            rule: "source",
            observe: true,
        });
    });

    it("waits for the flagged content's label", () => {
        const run = flagged();
        const unlabeled = { ...run, labels: run.labels.filter((item) => item.stepId !== STEP.fetch) };

        expect(findVerdict(unlabeled, STEP.fetch, "detection")).toBeUndefined();
    });

    const STOPPED = "cccccccccccccccc";
    const stop = decision({ stepId: STOPPED, tool: "test-model", guard: "limit", rule: "max-steps", at: at(62) });
    // The attack run read only trusted content, then went over the step limit
    const limited = (mode: "block" | "observe") => {
        const run = attackRun();
        // Sent in observe mode, and recorded in the same ms as its decision
        const sent = step({ stepId: STOPPED, kind: "model_call", name: "test-model", at: at(62) });
        return {
            ...run,
            steps: mode === "observe" ? [...run.steps, sent] : run.steps,
            labels: run.labels.filter((item) => item.trust === "trusted"),
            decisions: [{ ...stop, decision: "block", mode, enforced: mode === "block" }],
        };
    };

    it("takes the model call an enforced run limit stopped as the damage", () => {
        expect(findVerdict(limited("block"), STOPPED, "limit")).toMatchObject({
            category: "bad reasoning",
            turning: { stepId: STEP.end },
            damage: { stepId: STOPPED, tool: "test-model", at: at(62).toISOString(), ran: false, kind: "limit" },
            missingGuard: null,
        });
    });

    it("names the run limit in observe mode, and never takes the stopped call as its own turning point", () => {
        expect(findVerdict(limited("observe"), STOPPED, "limit")).toMatchObject({
            category: "missing guard",
            turning: { stepId: STEP.end },
            damage: { ran: true, kind: "limit" },
            missingGuard: { guard: "limit", rule: "max-steps", observe: true },
        });
    });

    it("finds nothing for a step no run limit stopped", () => {
        expect(findVerdict(limited("block"), STEP.end, "limit")).toBeUndefined();
    });
});

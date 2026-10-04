import type { ModelCallRecord } from "@quard/db";
import { costOf, ibanFrom } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { bodies, MODEL, PAGE } from "../test/attack.ts";
import { attackRun, changeStep, IBAN_KEY, label, STEP } from "../test/runs.ts";
import { findVerdict } from "../rootcause/verdict.ts";
import { NO_SUSPECT, NOT_A_CALL, planReplay } from "./plan.ts";
import { NOT_RECORDED } from "./request.ts";
import { NOT_A_TOOL_RESULT, REMOVED } from "./without.ts";

const STAND_IN = String(ibanFrom("DE", "465bcfb6141c9e5101e0a138e207ed3b"));

function calls(): ModelCallRecord[] {
    const record = { model: MODEL, responseId: null, toolCalls: [], outputText: [], at: new Date(0) };
    return [
        { ...record, stepId: STEP.ask, requestBody: bodies().ask },
        { ...record, stepId: STEP.decide, requestBody: bodies().decide },
    ];
}

function verdictOf(run = attackRun()) {
    const verdict = findVerdict(run, STEP.pay);
    if (verdict === undefined) {
        throw new Error("no verdict");
    }
    return verdict;
}

describe("planReplay", () => {
    it("resends the M1 turning point with a stand-in IBAN, and without the web page", () => {
        const plan = planReplay(verdictOf(), attackRun(), calls());

        expect(plan.base).toEqual({
            model: MODEL,
            harmfulCall: { tool: "payInvoice", keys: [IBAN_KEY] },
            removed: { contentId: "c2", origin: "web:invoices.evil-pay.com", callId: "call_1_0" },
        });
        const ready = typeof plan.ready === "string" ? undefined : plan.ready;
        const inputs = [ready?.bodies.with, ready?.bodies.without].map((body) => body?.input as { output?: string }[]);
        expect(inputs.map((input) => input.at(-1)?.output)).toEqual([PAGE.replace("DE89…3000", STAND_IN), REMOVED]);
        expect(ready?.bodies.with).toMatchObject({ model: MODEL, store: false, instructions: "You pay invoices." });
        expect(ready?.back.get(`iban:${STAND_IN}`)).toEqual([IBAN_KEY]);
    });

    it("guesses the warm-up pair's cost from the request size when the turning call has none", () => {
        const plan = planReplay(verdictOf(), attackRun(), calls());
        const body = typeof plan.ready === "string" ? {} : plan.ready.bodies.with;
        const inputTokens = Math.ceil(JSON.stringify(body).length / 4);

        expect(plan.firstRoundUsd).toBeCloseTo(
            2 * Number(costOf(MODEL, { inputTokens, cachedTokens: 0, outputTokens: 1_000 })),
            9,
        );

        const unknown = calls().map((call) => ({ ...call, requestBody: { ...call.requestBody, model: "own-model" } }));
        expect(planReplay(verdictOf(), attackRun(), unknown).firstRoundUsd).toBeUndefined();
    });

    it("maps a stand-in back to every stored value with its mask", () => {
        const twin = `iban:DE89…3000#${"b".repeat(32)}`;
        const run = attackRun();
        const more = { ...run, labels: [...run.labels, label({ contentId: "c9", stepId: STEP.ask, keys: [twin] })] };
        const plan = planReplay(verdictOf(), more, calls());
        const back = typeof plan.ready === "string" ? [] : [...plan.ready.back.values()];

        expect(back).toEqual([[IBAN_KEY, twin]]);
    });

    it("expects the first round to cost ten times the turning call", () => {
        const run = changeStep(attackRun(), STEP.decide, { detail: { costUsd: 0.002 } });

        expect(planReplay(verdictOf(run), run, calls()).firstRoundUsd).toBeCloseTo(0.02, 9);
    });

    it("looks for any value of the damaging call when the entry held none", () => {
        const verdict = { ...verdictOf(), entry: { ...verdictOf().entry, key: null } };

        expect(planReplay(verdict, attackRun(), calls()).base.harmfulCall).toEqual({
            tool: "payInvoice",
            keys: [IBAN_KEY],
        });
    });

    it("is limited when the turning-point request was not recorded", () => {
        const plan = planReplay(verdictOf(), attackRun(), []);

        expect(plan).toMatchObject({ base: { model: "" }, ready: NOT_RECORDED });
    });

    it("has nothing to replay when the verdict found no suspect content", () => {
        const verdict = verdictOf();
        const prompt = { ...verdict, entry: { ...verdict.entry, stepId: STEP.ask, contentId: null } };

        expect(planReplay(prompt, attackRun(), calls())).toMatchObject({
            base: { removed: { callId: null } },
            ready: NO_SUSPECT,
        });
    });

    it("is limited when the suspect content is no tool result in the turning request", () => {
        const verdict = verdictOf();
        const prompt = { ...verdict, entry: { ...verdict.entry, stepId: STEP.ask, contentId: "c1" } };

        expect(planReplay(prompt, attackRun(), calls())).toMatchObject({ ready: NOT_A_TOOL_RESULT });
    });

    it("counts a value of the suspect content as harm when the model made every value up", () => {
        const verdict = verdictOf();
        const mistyped = { key: "id:gb33bukb202015555555", generated: true, appearances: [] };
        const run = attackRun();
        const labels = run.labels.map((item) =>
            item.contentId === "c2" ? { ...item, keys: [...item.keys, "host:evil-pay.com"] } : item,
        );
        const made = { ...verdict, entry: { ...verdict.entry, key: null }, values: [mistyped] };

        expect(planReplay(made, { ...run, labels }, calls()).base.harmfulCall).toEqual({
            tool: "payInvoice",
            keys: [IBAN_KEY, "id:2026-114"],
        });
    });

    it("falls back to the damaging call's own values when nothing else holds one", () => {
        const verdict = verdictOf();
        const mistyped = { key: "id:gb33bukb202015555555", generated: true, appearances: [] };
        const none = { ...verdict, entry: { ...verdict.entry, key: null, contentId: null }, values: [mistyped] };

        expect(planReplay(none, attackRun(), calls()).base.harmfulCall.keys).toEqual([IBAN_KEY]);
    });

    it("leaves out the message that carried the content in, when the turning call never read it", () => {
        const verdict = verdictOf();
        // The page was read in the researcher's process; billing read it as a message
        const entry = { ...verdict.entry, stepId: "e".repeat(16), agent: "researcher" };
        const message = { stepId: STEP.fetch, kind: "message" as const, from: "researcher", to: "billing" };
        const handoff = { ...message, at: verdict.turning.at, trust: "untrusted" as const, verified: true };
        const across = { entryAgent: "researcher", handoff, turningAgent: "billing", damageAgent: "billing" };

        const plan = planReplay({ ...verdict, entry, acrossAgents: across }, attackRun(), calls());

        expect(plan.base.removed).toEqual({ contentId: "c2", origin: "agent:researcher", callId: "call_1_0" });
        const without =
            typeof plan.ready === "string" ? [] : (plan.ready.bodies.without.input as { output?: string }[]);
        expect(without.at(-1)?.output).toBe(REMOVED);
        expect(planReplay({ ...verdict, entry }, attackRun(), calls()).ready).toBe(NOT_A_TOOL_RESULT);
    });

    it.each(["detection", "limit"] as const)("is limited when the damage kind is %s", (kind) => {
        const verdict = verdictOf();
        const plan = planReplay({ ...verdict, damage: { ...verdict.damage, kind } }, attackRun(), calls());

        expect(plan).toMatchObject({ base: { harmfulCall: { tool: "payInvoice" } }, ready: NOT_A_CALL[kind] });
    });
});

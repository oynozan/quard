import type { ModelCallRecord } from "@quard/db";
import { costOf, ibanFrom } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { bodies, MODEL, PAGE } from "../test/attack.ts";
import { attackRun, changeStep, IBAN_KEY, label, STEP } from "../test/runs.ts";
import { findVerdict } from "../rootcause/verdict.ts";
import { NOT_A_CALL, planReplay } from "./plan.ts";
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

    it("is limited when the entry is no tool result", () => {
        const verdict = verdictOf();
        const prompt = { ...verdict, entry: { ...verdict.entry, stepId: STEP.ask, contentId: null } };

        expect(planReplay(prompt, attackRun(), calls())).toMatchObject({
            base: { removed: { callId: null } },
            ready: NOT_A_TOOL_RESULT,
        });
    });

    it.each(["detection", "limit"] as const)("is limited when the damage kind is %s", (kind) => {
        const verdict = verdictOf();
        const plan = planReplay({ ...verdict, damage: { ...verdict.damage, kind } }, attackRun(), calls());

        expect(plan).toMatchObject({ base: { harmfulCall: { tool: "payInvoice" } }, ready: NOT_A_CALL[kind] });
    });
});

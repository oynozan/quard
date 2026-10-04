import type { ModelCallRecord } from "@quard/db";
import { ibanFrom } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { bodies, MODEL, PAGE } from "../test/attack.ts";
import { attackRun, changeStep, IBAN_KEY, MESSAGE, passedOnRun, STEP } from "../test/runs.ts";
import { findVerdict } from "../rootcause/verdict.ts";
import { planReplay } from "./plan.ts";
import { NOT_RECORDED } from "./request.ts";
import { NOT_A_TOOL_RESULT, REMOVED } from "./without.ts";

const STAND_IN = String(ibanFrom("DE", "465bcfb6141c9e5101e0a138e207ed3b"));

function calls(): ModelCallRecord[] {
    const record = { model: MODEL, responseId: null, toolCalls: [], at: new Date(0) };
    return [
        { ...record, stepId: STEP.ask, requestBody: bodies().ask },
        { ...record, stepId: STEP.decide, requestBody: bodies().decide },
    ];
}

// Billing's turning-point request when the IBAN came in a message
function messageCalls(): ModelCallRecord[] {
    const { ask, decide } = bodies();
    const read = { type: "function_call", call_id: MESSAGE.callId, name: "readMessage", arguments: "{}" };
    const message = { type: "function_call_output", call_id: MESSAGE.callId, output: PAGE };
    const input = [...ask.input, read, message];
    return [
        {
            model: MODEL,
            responseId: null,
            toolCalls: [],
            at: new Date(0),
            stepId: STEP.decide,
            requestBody: { ...decide, input },
        },
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
        expect(plan.firstRoundUsd).toBeUndefined();
        const ready = typeof plan.ready === "string" ? undefined : plan.ready;
        const inputs = [ready?.bodies.with, ready?.bodies.without].map((body) => body?.input as { output?: string }[]);
        expect(inputs.map((input) => input.at(-1)?.output)).toEqual([PAGE.replace("DE89…3000", STAND_IN), REMOVED]);
        expect(ready?.bodies.with).toMatchObject({ model: MODEL, store: false, instructions: "You pay invoices." });
        expect(ready?.back.get(`iban:${STAND_IN}`)).toBe(IBAN_KEY);
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

    it("resends the turning point without the message that passed the page on", () => {
        const run = passedOnRun();
        const plan = planReplay(verdictOf(run), run, messageCalls());

        expect(plan.base.removed).toEqual({
            contentId: "c2",
            origin: "web:invoices.evil-pay.com",
            callId: MESSAGE.callId,
        });
        const ready = typeof plan.ready === "string" ? undefined : plan.ready;
        const inputs = [ready?.bodies.with, ready?.bodies.without].map((body) => body?.input as { output?: string }[]);
        expect(inputs.map((input) => input.at(-1)?.output)).toEqual([PAGE.replace("DE89…3000", STAND_IN), REMOVED]);
    });

    it("falls back to the page's own tool result when the request holds no message", () => {
        const run = passedOnRun();

        const removed = { type: "function_call_output", call_id: "call_1_0", output: REMOVED };

        expect(planReplay(verdictOf(run), run, calls())).toMatchObject({
            base: { removed: { callId: "call_1_0" } },
            ready: { bodies: { without: { input: expect.arrayContaining([removed]) } } },
        });
    });

    it("is limited when the entry is no tool result", () => {
        const verdict = verdictOf();
        const prompt = { ...verdict, entry: { ...verdict.entry, stepId: STEP.ask, contentId: null, key: null } };

        expect(planReplay(prompt, attackRun(), calls())).toMatchObject({
            base: { removed: { callId: null } },
            ready: NOT_A_TOOL_RESULT,
        });
    });
});

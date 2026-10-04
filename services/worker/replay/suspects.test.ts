import type { StoredVerdict } from "@quard/db";
import { describe, expect, it } from "vitest";
import type { StoredRun } from "../rootcause/run.ts";
import { findVerdict } from "../rootcause/verdict.ts";
import { at, attackRun, changeStep, MESSAGE, passedOnRun, STEP } from "../test/runs.ts";
import { suspectCallIds } from "./suspects.ts";

function verdictOf(run: StoredRun): StoredVerdict {
    const verdict = findVerdict(run, STEP.pay);
    if (verdict === undefined) {
        throw new Error("no verdict");
    }
    return verdict;
}

// The run without some of billing's steps
const without = (run: StoredRun, ...stepIds: string[]) => ({
    ...run,
    steps: run.steps.filter((item) => !stepIds.includes(item.stepId)),
});

describe("suspectCallIds", () => {
    it("takes the page's own tool result when the agent that paid read it", () => {
        expect(suspectCallIds(verdictOf(attackRun()), attackRun())).toEqual(["call_1_0"]);
    });

    it("puts the message that passed the value on to the turning agent first", () => {
        const run = passedOnRun();
        const verdict = verdictOf(run);

        expect(verdict).toMatchObject({
            entry: { agent: "researcher", contentId: "c2" },
            turning: { agent: "billing" },
        });
        expect(suspectCallIds(verdict, run)).toEqual([MESSAGE.callId, "call_1_0"]);
    });

    it("takes the one call the model asked for when the tool that read the message has no step", () => {
        const run = passedOnRun();

        expect(suspectCallIds(verdictOf(run), without(run, MESSAGE.read))).toEqual([MESSAGE.callId, "call_1_0"]);
    });

    it("finds no carrier when the model asked for several calls, or the agent had no step before", () => {
        const run = without(passedOnRun(), MESSAGE.read);
        const verdict = verdictOf(run);
        const calls = [
            { name: "readMessage", callId: MESSAGE.callId, arguments: "{}" },
            { name: "readNote", callId: "call_n", arguments: "{}" },
        ];

        expect(suspectCallIds(verdict, changeStep(run, MESSAGE.ask, { detail: { toolCalls: calls } }))).toEqual([
            "call_1_0",
        ]);
        expect(suspectCallIds(verdict, without(run, MESSAGE.ask))).toEqual(["call_1_0"]);
    });

    it("finds no carrier for a value the turning agent read in its own model call's input", () => {
        const run = passedOnRun();
        const prompt = run.labels.map((item) => (item.contentId === "c5" ? { ...item, stepId: MESSAGE.ask } : item));

        expect(suspectCallIds(verdictOf(run), { ...run, labels: prompt })).toEqual(["call_1_0"]);
    });

    it("leaves out copies stored after the turning call started", () => {
        const run = passedOnRun();
        const late = run.labels.map((item) => (item.contentId === "c5" ? { ...item, at: at(60) } : item));

        expect(suspectCallIds(verdictOf(run), { ...run, labels: late })).toEqual(["call_1_0"]);
    });

    it("finds none when the entry is the model call itself", () => {
        const verdict = verdictOf(attackRun());
        const reasoning = { ...verdict, entry: { ...verdict.entry, stepId: STEP.decide, contentId: null, key: null } };

        expect(suspectCallIds(reasoning, attackRun())).toEqual([]);
    });
});

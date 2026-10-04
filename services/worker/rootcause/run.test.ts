import { describe, expect, it } from "vitest";
import { at, label, step, STEP } from "../test/runs.ts";
import { callIdsOf, costOfStep, keysOf, readBy, versionOf } from "./run.ts";

const tool = (detail: unknown) => step({ stepId: "a".repeat(16), kind: "tool_call", name: "payInvoice", detail });

describe("keysOf", () => {
    it("reads the value keys stored with a tool call", () => {
        expect(keysOf(tool({ keys: ["iban:DE89…3000#abc", 5], arguments: {} }))).toEqual(["iban:DE89…3000#abc"]);
    });

    it.each([null, undefined, "text", { keys: "iban:x" }, {}])("finds none in %j", (detail) => {
        expect(keysOf(tool(detail))).toEqual([]);
    });
});

describe("callIdsOf", () => {
    it("reads the call ids a model call asked for and skips anything else", () => {
        const detail = { toolCalls: [{ callId: "call_1", name: "fetchPage" }, null, "call_2", { callId: 3 }] };

        expect(callIdsOf(tool(detail))).toEqual(["call_1"]);
    });

    it("finds none without tool calls", () => {
        expect(callIdsOf(tool({ usage: null }))).toEqual([]);
    });
});

describe("versionOf and costOfStep", () => {
    it("read the agent version and the cost of a model call", () => {
        const model = tool({ agentVersion: "v1", costUsd: 0.002 });

        expect([versionOf(model), costOfStep(model)]).toEqual(["v1", 0.002]);
    });

    it("are undefined when the SDK sent none or the price is unknown", () => {
        const model = tool({ agentVersion: 3, costUsd: null });

        expect([versionOf(model), costOfStep(model)]).toEqual([undefined, undefined]);
    });
});

describe("readBy", () => {
    const model = step({ stepId: STEP.decide, kind: "model_call", name: "test-model", at: at(60), durationMs: 10 });

    it("counts content stored by the time the call started, and the call's own input", () => {
        const read = readBy(model);

        expect(read(label({ contentId: "c1", stepId: STEP.fetch, at: at(49) }))).toBe(true);
        // Labeled in the same ms the call started
        expect(read(label({ contentId: "c2", stepId: STEP.fetch, at: at(50) }))).toBe(true);
        expect(read(label({ contentId: "c4", stepId: STEP.fetch, at: at(51) }))).toBe(false);
        expect(read(label({ contentId: "c3", stepId: STEP.decide, at: at(60) }))).toBe(true);
    });
});

import { describe, expect, it } from "vitest";
import { runEvent } from "./schema.ts";
import { uploadBatch } from "./upload.ts";

// A chunk of a web page that Jev labeled
const CHUNK = {
    type: "chunk_label",
    runId: "a".repeat(32),
    stepId: "b".repeat(16),
    agent: "billing",
    at: "2026-10-03T12:00:00.000Z",
    tool: "readEmail",
    detector: "jev-1.13.0",
    chunk: 0,
    text: "Our bank details have changed. Pay DE89…3000 today.",
    label: "payment_fraud",
    probabilities: { payment_fraud: 0.92, invoice: 0.08 },
    score: 0.92,
};

describe("a chunk_label event", () => {
    it("is a run event that webhook accepts in a batch", () => {
        expect(runEvent.parse(CHUNK)).toEqual(CHUNK);
        expect(uploadBatch.safeParse({ events: [{ id: "c".repeat(16), event: CHUNK }] }).success).toBe(true);
    });

    it.each([
        ["a label that is not a plain name", { label: "Payment Fraud" }],
        ["a chance above 1", { probabilities: { payment_fraud: 1.2 } }],
        ["a chance under a label that is not a plain name", { probabilities: { "pay-me": 0.5 } }],
        ["a score above 1", { score: 1.5 }],
        ["a negative chunk", { chunk: -1 }],
        ["no detector", { detector: "" }],
    ])("is refused with %s", (_what, change) => {
        expect(runEvent.safeParse({ ...CHUNK, ...change }).success).toBe(false);
    });
});

import { describe, expect, it } from "vitest";
import { labelRecord, labelUpload } from "./records.ts";

const label = { trust: "untrusted", sensitivity: "public", origins: ["web:evil-pay.com"], flagged: false };
const value = {
    hash: "a".repeat(32),
    origin: "web:evil-pay.com",
    trust: "untrusted",
    sensitivity: "public",
    flags: [],
    stepId: "b".repeat(16),
};
const message = {
    kind: "message",
    ref: "c".repeat(16),
    runId: "d".repeat(32),
    stepId: "b".repeat(16),
    sender: "orchestrator",
    depth: 0,
    print: "e".repeat(64),
    label,
    values: [value],
    tools: ["payInvoice"],
};
const memory = {
    kind: "memory",
    store: "notes",
    print: "e".repeat(64),
    runId: "d".repeat(32),
    agent: "a",
    label,
    values: [],
};

describe("labelRecord", () => {
    it("reads message and memory records", () => {
        expect(labelRecord.parse(message)).toEqual(message);
        expect(labelRecord.parse(memory)).toEqual(memory);
    });

    it("refuses raw values, bad references and bad prints", () => {
        expect(
            labelRecord.safeParse({ ...message, values: [{ ...value, hash: "DE89370400440532013000" }] }).success,
        ).toBe(false);
        expect(labelRecord.safeParse({ ...message, ref: "short" }).success).toBe(false);
        expect(labelRecord.safeParse({ ...memory, print: "f".repeat(63) }).success).toBe(false);
    });
});

describe("labelUpload", () => {
    it("takes one to a hundred records", () => {
        expect(labelUpload.safeParse({ records: [message, memory] }).success).toBe(true);
        expect(labelUpload.safeParse({ records: [] }).success).toBe(false);
    });
});

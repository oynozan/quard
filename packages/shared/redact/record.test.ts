import { describe, expect, it } from "vitest";
import type { MemoryRecord, MessageRecord } from "../labels/records.ts";
import { parseHashKey } from "./hash.ts";
import { redactRecord } from "./record.ts";
import { createRedactor } from "./redactor.ts";

const redactor = createRedactor(parseHashKey("ab".repeat(32)));
const SECRET = "sk-proj-abcdefghijklmnopqrstuvwx";
// Holds a digit run that passes the card check
const PRINT = `a4111111111111111${"b".repeat(47)}`;
const HASH = "c".repeat(32);

const label = {
    trust: "untrusted" as const,
    sensitivity: "public" as const,
    origins: ["email:jane@acme.com", "web:x.io/?iban=DE89370400440532013000", `mcp:crm?token=${SECRET}`],
    flagged: false,
};
const value = {
    hash: HASH,
    origin: "web:x.io/?card=4111111111111111",
    trust: "untrusted" as const,
    sensitivity: "public" as const,
    flags: [`token=${SECRET}`, "jane@acme.com"],
    stepId: "d".repeat(16),
};
const clean = {
    label: { ...label, origins: ["email:j…@acme.com", "web:x.io/?iban=DE89…3000", "mcp:crm?token=…"] },
    values: [{ ...value, origin: "web:x.io/?card=4111…1111", flags: ["token=…", "j…@acme.com"] }],
};

const message: MessageRecord = {
    kind: "message",
    ref: "e".repeat(16),
    runId: "f".repeat(32),
    sender: `agent-${SECRET}`,
    depth: 0,
    print: PRINT,
    label,
    values: [value],
};

const memory: MemoryRecord = {
    kind: "memory",
    store: "notes of jane@acme.com",
    print: PRINT,
    runId: "f".repeat(32),
    agent: `billing-${SECRET}`,
    label,
    values: [value],
};

describe("redactRecord", () => {
    it("masks and removes secrets from the names and origins of a message record", () => {
        const tools = [`pay-${SECRET}`, "refund jane@acme.com"];

        expect(redactRecord({ ...message, tools }, redactor)).toEqual({
            ...message,
            ...clean,
            sender: "agent-sk-proj-…",
            tools: ["pay-sk-proj-…", "refund j…@acme.com"],
        });
        expect(redactRecord(message, redactor)).not.toHaveProperty("tools");
    });

    it("masks the store and agent of a memory record, and never touches hashes", () => {
        expect(redactRecord(memory, redactor)).toEqual({
            ...memory,
            ...clean,
            store: "notes of j…@acme.com",
            agent: "billing-sk-proj-…",
        });
    });

    it("leaves a record it already redacted as it is", () => {
        const once = redactRecord({ ...message, tools: [`pay-${SECRET}`] }, redactor);

        expect(redactRecord(once, redactor)).toEqual(once);
        expect(redactRecord(redactRecord(memory, redactor), redactor)).toEqual(redactRecord(memory, redactor));
    });
});

import { describe, expect, it } from "vitest";
import { clientMessage, fleetValue, serverMessage } from "./protocol.ts";

const RUN = "a".repeat(32);
const STEP = "b".repeat(16);
const ASK = "c".repeat(16);
const HASH = "d".repeat(32);
const AT = "2026-10-03T12:00:00.000Z";
const RULES = {
    hash: "e".repeat(16),
    list: [{ tool: "payInvoice", guard: "approval", rule: "approval", mode: "block" }],
};

const ask = {
    type: "ask",
    askId: ASK,
    runId: RUN,
    stepId: STEP,
    agent: "billing",
    tool: "payInvoice",
    argsHash: HASH,
    args: { iban: "DE89370400440532013000", amount: 4950 },
    labels: [
        {
            path: "iban",
            values: [
                {
                    type: "iban",
                    generated: false,
                    origins: [
                        {
                            origin: "web:evil-pay.com",
                            trust: "untrusted",
                            sensitivity: "public",
                            flags: [],
                            stepId: STEP,
                            match: "exact",
                        },
                    ],
                },
            ],
        },
    ],
    context: { trust: "untrusted", sensitivity: "public", origins: ["web:evil-pay.com"], flagged: false },
    reasons: [{ guard: "approval", rule: "approval", reason: "approval_required" }],
};

describe("clientMessage", () => {
    it.each([
        { type: "hello", sdk: "0.0.0", host: "worker-1", pid: 42, rules: RULES },
        { type: "rules", rules: RULES },
        { type: "agent", agent: "billing", version: "f".repeat(16), model: "gpt-5-nano", tools: ["payInvoice"] },
        ask,
        { ...ask, requestId: `apr_${"1".repeat(16)}` },
        { type: "beat", askIds: [ASK] },
        { type: "cancel", askId: ASK },
        { type: "count", id: ASK, tool: "payInvoice", counter: "amount:amount", day: "2026-10-03", add: 10, max: 50 },
        { type: "count", id: ASK, tool: "payInvoice", counter: "calls", day: "2026-10-03", add: 1 },
        {
            type: "fleet",
            id: ASK,
            runId: RUN,
            agent: "billing",
            tool: "payInvoice",
            blocked: false,
            values: [
                { field: "iban", kind: "iban", key: `iban:DE89…3000#${HASH}` },
                { field: "url", kind: "domain", key: "domain:evil-pay.com" },
            ],
        },
    ])("accepts a $type message", (message) => {
        expect(clientMessage.safeParse(message).success).toBe(true);
    });

    it.each([
        ["an ask with no reason", { ...ask, reasons: [] }],
        ["an ask with a bad run id", { ...ask, runId: "nope" }],
        [
            "a counter with an unknown name",
            { type: "count", id: ASK, tool: "t", counter: "x", day: "2026-10-03", add: 1 },
        ],
        ["a negative count", { type: "count", id: ASK, tool: "t", counter: "calls", day: "2026-10-03", add: -1 }],
        ["an unknown type", { type: "nope" }],
    ])("refuses %s", (_, message) => {
        expect(clientMessage.safeParse(message).success).toBe(false);
    });
});

describe("fleetValue", () => {
    it("refuses a raw IBAN or email, and a domain with a path", () => {
        expect(fleetValue.safeParse({ field: "iban", kind: "iban", key: "iban:DE89370400440532013000" }).success).toBe(
            false,
        );
        expect(fleetValue.safeParse({ field: "to", kind: "email", key: "email:jane@acme.com" }).success).toBe(false);
        expect(fleetValue.safeParse({ field: "url", kind: "domain", key: "domain:evil.com/x" }).success).toBe(false);
    });
});

describe("serverMessage", () => {
    it.each([
        {
            type: "ready",
            at: AT,
            quarantine: [{ key: `iban:DE89…3000#${HASH}`, observe: false }],
            fleetObserveUntil: null,
            counters: [{ tool: "payInvoice", counter: "calls", day: "2026-10-03", used: 3 }],
        },
        { type: "asked", askId: ASK, requestId: `apr_${"1".repeat(16)}` },
        { type: "decided", askId: ASK, answer: "always", grantId: `grt_${"2".repeat(16)}` },
        { type: "decided", askId: ASK, answer: "once", requestId: `apr_${"1".repeat(16)}` },
        { type: "counted", id: ASK, ok: false, used: 50 },
        { type: "fleet_result", id: ASK, quarantined: [], fleetObserveUntil: AT },
        { type: "quarantine", add: [], remove: ["domain:evil-pay.com"] },
        { type: "error", code: "bad_message", message: "not JSON" },
    ])("accepts a $type message", (message) => {
        expect(serverMessage.safeParse(message).success).toBe(true);
    });

    it("refuses an answer it does not know", () => {
        expect(serverMessage.safeParse({ type: "decided", askId: ASK, answer: "maybe" }).success).toBe(false);
    });
});

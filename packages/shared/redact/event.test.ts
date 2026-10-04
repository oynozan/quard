import { describe, expect, it } from "vitest";
import type { RunEvent } from "../events/schema.ts";
import { redactEvent } from "./event.ts";
import { keyedHash, parseHashKey } from "./hash.ts";
import { createRedactor } from "./redactor.ts";

const KEY = parseHashKey("ab".repeat(32));
const redactor = createRedactor(KEY);
const IBAN = "DE89370400440532013000";
const base = { runId: "a".repeat(32), stepId: "b".repeat(16), agent: "billing", at: "2026-10-03T12:00:00.000Z" };
const hashed = `iban:DE89…3000#${keyedHash(KEY, "iban", IBAN)}`;

describe("redactEvent", () => {
    it("hashes the value keys of a content event", () => {
        const event: RunEvent = {
            type: "content",
            ...base,
            contentId: "c1",
            origin: "web:acme-billing.net",
            trust: "untrusted",
            sensitivity: "public",
            flags: [],
            keys: [`iban:${IBAN}`, "host:acme-billing.net"],
        };
        expect(redactEvent(redactor, event)).toEqual({ ...event, keys: [hashed, "host:acme-billing.net"] });
    });

    it("redacts tool call arguments and hashes their keys", () => {
        const event: RunEvent = {
            type: "tool_call",
            ...base,
            tool: "payInvoice",
            arguments: { iban: IBAN, amount: 4950 },
            status: "blocked",
            influenced: true,
            flagged: false,
            durationMs: 1,
            keys: [`iban:${IBAN}`],
        };
        expect(redactEvent(redactor, event)).toEqual({
            ...event,
            arguments: { iban: "DE89…3000", amount: 4950 },
            keys: [hashed],
        });
    });

    it("masks a card number sent as a number in tool call arguments", () => {
        const event: RunEvent = {
            type: "tool_call",
            ...base,
            tool: "payByCard",
            arguments: { card: 4111111111111111, amount: 50 },
            status: "blocked",
            influenced: false,
            flagged: false,
            durationMs: 1,
        };

        expect(redactEvent(redactor, event)).toEqual({ ...event, arguments: { card: "4111…1111", amount: 50 } });
    });

    it("redacts the strings of other events", () => {
        const call: RunEvent = {
            type: "tool_call",
            ...base,
            tool: "sendEmail",
            arguments: { to: "jane@acme.com" },
            status: "ok",
            influenced: false,
            flagged: false,
            durationMs: 1,
        };
        expect(redactEvent(redactor, call)).toEqual({ ...call, arguments: { to: "j…@acme.com" } });
        const model: RunEvent = {
            type: "model_call",
            ...base,
            model: "gpt-5.4-mini",
            toolCalls: [{ callId: "c", name: "payInvoice", arguments: `{"iban":"${IBAN}"}` }],
            status: "ok",
            durationMs: 9,
        };
        expect(redactEvent(redactor, model)).toEqual({
            ...model,
            toolCalls: [{ callId: "c", name: "payInvoice", arguments: '{"iban":"DE89…3000"}' }],
        });
    });

    it("keeps ids whose digits pass as a card number", () => {
        const card = "4111111111111111";
        const decision: RunEvent = {
            type: "decision",
            runId: `${card}abcdefabcdefabcd`,
            stepId: card,
            agent: card,
            at: base.at,
            tool: "payInvoice",
            guard: "action",
            rule: card,
            decision: "block",
            mode: "block",
            enforced: true,
            rules: card,
            request: `apr_${card}`,
        };
        expect(redactEvent(redactor, decision)).toEqual({ ...decision, agent: "4111…1111", rule: "4111…1111" });
        const model: RunEvent = {
            type: "model_call",
            ...base,
            parentStepId: card,
            model: "m",
            toolCalls: [],
            agentVersion: card,
            status: "ok",
            durationMs: 1,
        };
        expect(redactEvent(redactor, model)).toEqual(model);
    });

    it("still redacts id fields that are not plain ids", () => {
        const odd: RunEvent = {
            type: "run_finished",
            runId: "4111 1111 1111 1111",
            agent: "a",
            at: base.at,
            status: "completed",
        };
        expect(redactEvent(redactor, odd)).toEqual({ ...odd, runId: "4111…1111" });
    });
});

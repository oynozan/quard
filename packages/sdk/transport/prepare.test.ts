import { createRedactor, keyedHash, parseHashKey, type RunEvent } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { prepareEvent } from "./prepare.ts";

const KEY = parseHashKey("ab".repeat(32));
const redactor = createRedactor(KEY);
const IBAN = "DE89370400440532013000";
const base = { runId: "1".repeat(32), stepId: "2".repeat(16), agent: "billing", at: "2026-10-03T12:00:00.000Z" };

describe("prepareEvent", () => {
    it("adds the hashed value keys of a tool call's arguments, then redacts it", () => {
        const event: RunEvent = {
            type: "tool_call",
            ...base,
            tool: "payInvoice",
            arguments: { iban: `${IBAN} `, again: IBAN, amount: 10 },
            status: "blocked",
            influenced: true,
            flagged: false,
            durationMs: 1,
        };

        expect(prepareEvent(event, redactor)).toMatchObject({
            arguments: { iban: "DE89…3000 ", again: "DE89…3000", amount: 10 },
            keys: [`iban:DE89…3000#${keyedHash(KEY, "iban", IBAN)}`],
        });
    });

    it("masks a card number sent as a number, in the arguments and their keys", () => {
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

        const prepared = prepareEvent(event, redactor);

        expect(prepared).toMatchObject({ arguments: { card: "4111…1111", amount: 50 } });
        expect(JSON.stringify(prepared)).not.toContain("4111111111111111");
    });

    it("redacts other events as they are", () => {
        const event: RunEvent = { type: "warning", ...base, code: "unwrapped_tool", tool: "mail jane@acme.com" };

        expect(prepareEvent(event, redactor)).toEqual({ ...event, tool: "mail j…@acme.com" });
    });
});

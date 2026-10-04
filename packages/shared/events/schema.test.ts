import { describe, expect, it } from "vitest";
import { runEvent } from "./schema.ts";

const RUN = "a".repeat(32);
const base = { runId: RUN, stepId: "b".repeat(16), agent: "default", at: "2026-10-03T12:00:00.000Z" };

describe("runEvent", () => {
    it.each([
        {
            type: "payment",
            ...base,
            stage: "settled",
            host: "api.example",
            resource: "https://api.example/data",
            x402Version: 2,
            scheme: "exact",
            network: "eip155:84532",
            asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            amount: "10000",
            usd: 0.01,
            payTo: "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
            transaction: "0xabc",
            delivered: true,
        },
        {
            type: "message",
            ...base,
            from: "orchestrator",
            parentStepId: "c".repeat(16),
            labelRef: "d".repeat(16),
            verified: true,
            trust: "untrusted",
            sensitivity: "public",
        },
        { type: "handoff", ...base, to: "billing", via: "tool", trust: "trusted", sensitivity: "internal" },
        {
            type: "memory",
            ...base,
            store: "notes",
            op: "read",
            items: 2,
            verified: 1,
            trust: "untrusted",
            sensitivity: "internal",
        },
        {
            type: "model_call",
            ...base,
            model: "gpt",
            toolCalls: [{ callId: "c", name: "t", arguments: "{}" }],
            usage: { inputTokens: 10, cachedTokens: 2, outputTokens: 5 },
            agentVersion: "f".repeat(16),
            requestBody: { model: "gpt", input: [{ role: "user", content: "hi" }], store: false },
            status: "ok",
            durationMs: 3,
        },
        {
            type: "run_finished",
            runId: RUN,
            agent: "a",
            at: "2026-10-03T12:00:00.000Z",
            status: "failed",
            error: "boom",
        },
        {
            type: "run_started",
            runId: RUN,
            agent: "a",
            at: "2026-10-03T12:00:00.000Z",
            origins: { "mcp:crm": { trust: "trusted" } },
        },
        {
            type: "tool_call",
            ...base,
            tool: "t",
            arguments: { a: 1 },
            status: "blocked",
            influenced: true,
            flagged: false,
            durationMs: 0,
        },
        {
            type: "decision",
            ...base,
            tool: "t",
            guard: "action",
            rule: "r1",
            decision: "block",
            mode: "block",
            enforced: true,
            rules: "e".repeat(16),
            request: `apr_${"1".repeat(16)}`,
        },
        {
            type: "content",
            ...base,
            contentId: "c1",
            origin: "web:a.com",
            trust: "untrusted",
            sensitivity: "public",
            flags: [],
            keys: [],
        },
        { type: "warning", ...base, code: "unwrapped_tool", tool: "t" },
        { type: "warning", ...base, code: "detector_error", tool: "t", reason: "http_429" },
        {
            type: "decision",
            ...base,
            tool: "t",
            guard: "detector",
            rule: "jev",
            decision: "flag",
            mode: "observe",
            enforced: false,
            policy: "2026-10-03.1",
            score: 0.93,
        },
        { type: "config_error", at: "t", source: "policy", message: "bad file" },
    ])("accepts a $type event", (event) => {
        expect(runEvent.parse(event)).toEqual(event);
    });

    it("rejects an unknown event type", () => {
        expect(runEvent.safeParse({ type: "nope", ...base }).success).toBe(false);
    });

    it("rejects a decision with a bad value", () => {
        const event = {
            type: "decision",
            ...base,
            tool: "t",
            guard: "g",
            rule: "r",
            decision: "maybe",
            mode: "block",
            enforced: true,
        };

        expect(runEvent.safeParse(event).success).toBe(false);
    });

    it.each([
        ["a run id that is not 32 hex characters", { runId: "run-1" }],
        ["a step id that is not 16 hex characters", { stepId: "step" }],
        ["a time that is not ISO", { at: "yesterday" }],
        ["an empty agent", { agent: "" }],
        ["a negative duration", { durationMs: -1 }],
        ["a request body that is not an object", { requestBody: "{}" }],
    ])("rejects %s", (_, change) => {
        const event = {
            type: "model_call",
            ...base,
            model: "m",
            toolCalls: [],
            status: "ok",
            durationMs: 1,
            ...change,
        };

        expect(runEvent.safeParse(event).success).toBe(false);
    });

    it("rejects a detector score outside 0 to 1", () => {
        const event = {
            type: "decision",
            ...base,
            tool: "t",
            guard: "detector",
            rule: "r",
            decision: "flag",
            mode: "observe",
            enforced: false,
            score: 1.5,
        };

        expect(runEvent.safeParse(event).success).toBe(false);
    });
});

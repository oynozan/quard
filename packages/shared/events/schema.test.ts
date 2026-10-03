import { describe, expect, it } from "vitest";
import { runEvent } from "./schema.ts";

const base = { runId: "r", stepId: "s", agent: "default", at: "2026-10-03T12:00:00.000Z" };

describe("runEvent", () => {
    it.each([
        {
            type: "model_call",
            ...base,
            model: "gpt",
            toolCalls: [{ callId: "c", name: "t", arguments: "{}" }],
            status: "ok",
            durationMs: 3,
        },
        { type: "run_started", runId: "r", agent: "a", at: "t", origins: { "mcp:crm": { trust: "trusted" } } },
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

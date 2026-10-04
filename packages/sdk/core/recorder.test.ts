import type { RunEvent } from "@quard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configure, resetConfig } from "./config.ts";
import { addDropped, bufferedEvents, now, record, takeDropped, takeEvents } from "./recorder.ts";

function warning(code: string): RunEvent {
    return { type: "warning", runId: "r", stepId: "s", agent: "a", at: "t", code };
}

function allow(rule: string, decision: "allow" | "pass" = "allow"): RunEvent {
    return {
        type: "decision",
        runId: "r",
        stepId: "s",
        agent: "a",
        at: "t",
        tool: "t",
        guard: "action",
        rule,
        decision,
        mode: "block",
        enforced: true,
    };
}

afterEach(() => {
    resetConfig();
    takeEvents();
    takeDropped();
});

describe("recorder", () => {
    it("buffers events and hands them over once", () => {
        record(warning("one"));

        expect(bufferedEvents()).toBe(1);
        expect(takeEvents()).toEqual([warning("one")]);
        expect(takeEvents()).toEqual([]);
        expect(bufferedEvents()).toBe(0);
    });

    it("passes each event to onEvent", () => {
        const onEvent = vi.fn();
        configure({ onEvent });

        record(warning("two"));

        expect(onEvent).toHaveBeenCalledWith(warning("two"));
    });

    it("keeps going when onEvent throws", () => {
        configure({
            onEvent: () => {
                throw new Error("log sink down");
            },
        });

        expect(() => record(warning("three"))).not.toThrow();
        expect(takeEvents()).toEqual([warning("three")]);
    });

    it("drops the oldest event when the buffer is full, and counts it", () => {
        for (let i = 0; i <= 10_000; i++) {
            record(warning(String(i)));
        }
        const events = takeEvents();

        expect(events).toHaveLength(10_000);
        expect(events[0]).toEqual(warning("1"));
        expect(takeDropped()).toBe(1);
        expect(takeDropped()).toBe(0);
    });

    it("counts events lost after they left the buffer with the ones it dropped", () => {
        for (let i = 0; i <= 10_000; i++) {
            record(warning(String(i)));
        }
        addDropped(2);

        expect(takeDropped()).toBe(3);
        expect(takeDropped()).toBe(0);
    });

    it("drops allow decisions before anything else", () => {
        record(warning("first"));
        record(allow("quiet"));
        for (let i = 0; i < 9_999; i++) {
            record(warning(String(i)));
        }

        expect(takeEvents(2)).toEqual([warning("first"), warning("0")]);
    });

    it("counts a source pass as an allow", () => {
        record(allow("scan", "pass"));
        for (let i = 0; i < 10_000; i++) {
            record(warning(String(i)));
        }

        expect(takeEvents(1)).toEqual([warning("0")]);
    });

    it("strips the oldest request bodies past 32 Mi characters", () => {
        const call = (input: string): RunEvent => ({
            type: "model_call",
            runId: "r",
            stepId: input.slice(0, 1),
            agent: "a",
            at: "t",
            model: "m",
            toolCalls: [],
            status: "ok",
            durationMs: 1,
            agentVersion: "v",
            ...(input === "" ? {} : { requestBody: { input } }),
        });
        const big = (name: string) => call(name.repeat(12 * 1024 * 1024));
        record(warning("first"));
        record(call(""));
        record(big("a"));
        record(big("b"));
        record(big("c"));

        const events = takeEvents();
        expect(events.map((event) => event.type === "model_call" && event.requestBody !== undefined)).toEqual([
            false,
            false,
            false,
            true,
            true,
        ]);
        record(big("d"));
        record(big("e"));
        expect(takeEvents().every((event) => event.type === "model_call" && event.requestBody !== undefined)).toBe(
            true,
        );
    });

    it("counts output texts with the bodies and strips both", () => {
        const call = (text: string, withBody: boolean): RunEvent => ({
            type: "model_call",
            runId: "r",
            stepId: text.slice(0, 1),
            agent: "a",
            at: "t",
            model: "m",
            toolCalls: [],
            status: "ok",
            durationMs: 1,
            agentVersion: "v",
            ...(withBody ? { requestBody: { input: "hi" } } : {}),
            outputText: [text],
        });
        record(call("a".repeat(20 * 1024 * 1024), false));
        record(call("b".repeat(20 * 1024 * 1024), true));

        expect(takeEvents().map((event) => event.type === "model_call" && event.outputText !== undefined)).toEqual([
            false,
            true,
        ]);
    });

    it("stamps the time as ISO text", () => {
        expect(now()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});

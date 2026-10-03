import type { RunEvent } from "@quard/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configure, resetConfig } from "./config.ts";
import { now, record, takeDropped, takeEvents } from "./recorder.ts";

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

        expect(takeEvents()).toEqual([warning("one")]);
        expect(takeEvents()).toEqual([]);
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

    it("stamps the time as ISO text", () => {
        expect(now()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});

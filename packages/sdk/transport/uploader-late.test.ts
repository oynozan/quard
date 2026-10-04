import { createRedactor, MAX_BATCH_BYTES, parseHashKey, type RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { record, takeDropped, takeEvents } from "../core/recorder.ts";
import { createUploader, type Send } from "./uploader.ts";

const redactor = createRedactor(parseHashKey("ab".repeat(32)));

// A tool call a third of the webhook's body limit in size
function bigCall(): RunEvent {
    return {
        type: "tool_call",
        runId: "1".repeat(32),
        stepId: "2".repeat(16),
        agent: "researcher",
        at: new Date().toISOString(),
        tool: "readPage",
        arguments: { text: "x".repeat(MAX_BATCH_BYTES / 3) },
        status: "ok",
        influenced: false,
        flagged: false,
        durationMs: 1,
    };
}

beforeEach(() => {
    takeEvents();
    takeDropped();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("uploader", () => {
    it("marks a batch split off earlier degraded when it goes out late", async () => {
        vi.useFakeTimers();
        // The degraded mark of each event in each batch sent
        const marks: Array<Array<boolean | undefined>> = [];
        const send: Send = async (_url, init) => {
            const { events } = JSON.parse(String(init.body)) as { events: Array<{ degraded?: boolean }> };
            marks.push(events.map((item) => item.degraded));
            if (marks.length === 1) {
                throw new Error("connection refused");
            }
            return new Response("{}", { status: 202 });
        };
        const up = createUploader({ webhookUrl: "http://webhook.test", key: "k", redactor, send });
        record(bigCall());
        record(bigCall());
        record(bigCall());

        expect(await up.flush()).toBe(false);
        vi.setSystemTime(Date.now() + 120_000);
        expect(await up.flush()).toBe(true);

        expect(marks).toEqual([[undefined, undefined], [true, true], [true]]);
    });
});

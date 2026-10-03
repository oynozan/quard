import { describe, expect, it } from "vitest";
import { MAX_BATCH, uploadBatch } from "./upload.ts";

const event = {
    type: "run_started",
    runId: "a".repeat(32),
    agent: "billing",
    at: "2026-10-03T12:00:00.000Z",
    origins: {},
};
const item = { id: "c".repeat(16), event };

describe("uploadBatch", () => {
    it("accepts events in envelopes, late ones marked degraded", () => {
        expect(uploadBatch.parse({ events: [item, { ...item, degraded: true }] }).events).toHaveLength(2);
    });

    it.each([
        ["an empty batch", { events: [] }],
        ["a batch that is too big", { events: Array.from({ length: MAX_BATCH + 1 }, () => item) }],
        ["a bad event id", { events: [{ ...item, id: "nope" }] }],
        ["a bad event", { events: [{ ...item, event: { type: "nope" } }] }],
    ])("rejects %s", (_, body) => {
        expect(uploadBatch.safeParse(body).success).toBe(false);
    });
});

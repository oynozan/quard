// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NOW } from "../../../../../test/time";
import { activityOf, edgeOf, nodeOf, quietNode, statsOf } from "./rows";

const seen = new Date(NOW - 5_000);

describe("nodeOf", () => {
    it("names a running agent with its model, runs and last event", () => {
        const row = { agent: "billing", lastSeenAt: seen, runs24h: 4, running: true, model: "gpt-5.4-mini" };
        expect(nodeOf(row)).toEqual({
            name: "billing",
            state: "running",
            model: "gpt-5.4-mini",
            runs24h: 4,
            lastSeenAt: NOW - 5_000,
        });
    });

    it("calls an agent that is not running idle, with no model when it made no model call", () => {
        const row = { agent: "support", lastSeenAt: seen, runs24h: 0, running: false, model: null };
        expect(nodeOf(row)).toMatchObject({ state: "idle", model: null });
    });
});

describe("quietNode", () => {
    it("keeps an agent heard from before the window idle, with only its last event", () => {
        expect(quietNode("archive", seen)).toEqual({
            name: "archive",
            state: "idle",
            model: null,
            runs24h: 0,
            lastSeenAt: NOW - 5_000,
        });
    });
});

describe("edgeOf", () => {
    it("makes delegations the whole link and rounds the untrusted share", () => {
        const row = { from: "orchestrator", to: "billing", delegations: 3, untrusted: 1, runs: 2, lastAt: seen };
        expect(edgeOf(row)).toEqual({
            from: "orchestrator",
            to: "billing",
            delegations: 3,
            handoffs: 0,
            messages: 0,
            total: 3,
            untrusted: 1,
            untrustedShare: 0.333,
            lastAt: NOW - 5_000,
        });
    });
});

describe("statsOf", () => {
    it("rounds the share of model calls that had read untrusted content", () => {
        const row = { modelCalls: 3, influenced: 2, costUsd: 0.0093, costKnown: true, asked: 1, blocked: 2 };
        expect(statsOf(row)).toEqual({
            modelCalls24h: 3,
            influencedShare: 0.667,
            costUsd24h: 0.0093,
            costKnown: true,
            asked24h: 1,
            blocked24h: 2,
        });
    });

    it("has no share without model calls, and keeps an unknown cost unknown", () => {
        const row = { modelCalls: 0, influenced: 0, costUsd: 0, costKnown: false, asked: 1, blocked: 0 };
        expect(statsOf(row)).toMatchObject({ influencedShare: null, costKnown: false });
    });
});

describe("activityOf", () => {
    it("fills the hours the query left out with 0, from the window start", () => {
        const since = new Date(Date.UTC(2026, 9, 2, 19));
        const activity = activityOf(
            [
                { bucket: 0, count: 2 },
                { bucket: 23, count: 5 },
            ],
            since,
        );
        expect(activity.startAt).toBe(since.getTime());
        expect(activity.perHour).toHaveLength(24);
        expect(activity.perHour[0]).toBe(2);
        expect(activity.perHour[23]).toBe(5);
        expect(activity.perHour.slice(1, 23).every((count) => count === 0)).toBe(true);
        expect(activityOf([], since).perHour).toEqual(Array.from({ length: 24 }, () => 0));
    });
});

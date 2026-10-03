// @vitest-environment node
import { createProject, ingestBatch } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decision, modelCall, started, stepId, toolCall, upload, type UploadItem } from "../../../test/overview/events";
import { NEW_INSTALL, QUIET } from "../../../test/overview/fixtures";
import { billing, FLEET, SUPPORT_CALL, support } from "../../../test/overview/fleet";
import { DAY, HOUR, MINUTE, NOW } from "../../../test/time";

const requireSession = vi.hoisted(() => vi.fn(async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 })));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const { getOverview } = await import("./overview");
const { database } = await import("./runs/live/client");

let test: TestDb;
let projects = 0;

beforeAll(async () => {
    test = await startTestDb();
    vi.stubEnv("DATABASE_URL", test.url);
    vi.stubEnv("QUARD_PROJECT_ID", "");
}, 60_000);

afterAll(async () => {
    await database().destroy();
    vi.unstubAllEnvs();
    await test.stop();
});

// A fresh project for the dashboard to show, holding these events
async function showProject(events: UploadItem["event"][]): Promise<void> {
    const id = await createProject(test.db, `Project ${++projects}`);
    vi.stubEnv("QUARD_PROJECT_ID", id);
    if (events.length > 0) await ingestBatch(test.db, id, upload(events));
}

describe("getOverview", () => {
    it("is all zeros with a plain greeting before a project exists", async () => {
        expect(await getOverview(NOW)).toEqual(NEW_INSTALL);
        expect(requireSession).toHaveBeenCalled();
    });

    it("is all zeros with a plain greeting before the project's first run", async () => {
        await showProject([]);

        expect(await getOverview(NOW)).toEqual(NEW_INSTALL);
    });

    it("greets with the running agents and lists them first", async () => {
        await showProject(FLEET);
        const overview = await getOverview(NOW);

        expect(overview.greeting).toBe("Good evening. One agent is running.");
        expect(overview.agents).toEqual([
            { name: "billing", state: "running", model: "gpt-5.4-mini" },
            { name: "researcher", state: "idle", model: "o4-mini" },
            { name: "support", state: "idle", model: "gpt-5.4" },
        ]);
    });

    it("counts model calls in 10-minute buckets up to the next round 10 minutes", async () => {
        await showProject(FLEET);
        const activity = (await getOverview(NOW)).activity;

        expect(activity.endsAt).toBe(Date.UTC(2026, 9, 3, 18, 50));
        expect(activity.values).toHaveLength(144);
        const lit = activity.values.flatMap((count, bucket) => (count ? [[bucket, count]] : []));
        expect(lit).toEqual([
            [0, 1],
            [125, 1],
            [142, 2],
            [143, 1],
        ]);
    });

    it("counts run starts per hour and the guarded tools of the last 24 hours", async () => {
        await showProject(FLEET);
        const overview = await getOverview(NOW);

        const started = overview.runsPerHour.flatMap((count, hour) => (count ? [[hour, count]] : []));
        expect(overview.runsPerHour).toHaveLength(24);
        expect(started).toEqual([
            [20, 1],
            [23, 1],
        ]);
        expect(overview.coverage).toEqual({ seen: 3, guarded: 2 });
    });

    it("gives the share of guarded calls blocked per UTC day for 30 days", async () => {
        await showProject(FLEET);
        const { blockRate } = await getOverview(NOW);

        expect(blockRate.startAt).toBe(Date.UTC(2026, 8, 4));
        expect(blockRate.limit).toBe(2);
        // Two days ago one call, blocked, and today two calls, one blocked
        expect(blockRate.values).toEqual([...Array<number>(27).fill(0), 100, 0, 50]);
    });

    it("totals enforced blocks and asks, and orders the guards with unknown ones last", async () => {
        await showProject(FLEET);
        const overview = await getOverview(NOW);

        expect(overview.decisions24h).toEqual({ blocked: 3, asked: 1 });
        expect(overview.guardCounts).toEqual([
            { type: "source", count: 1 },
            { type: "action", count: 1 },
            { type: "egress", count: 1 },
            { type: "limit", count: 2 },
            { type: "approval", count: 1 },
            { type: "permission", count: 1 },
            { type: "signature", count: 1 },
            { type: "budget", count: 1 },
        ]);
    });

    it("logs the decisions oldest first, in the run timeline's words", async () => {
        await showProject(FLEET);
        const { events } = await getOverview(NOW);

        expect(events.map(({ guard, outcome, tool, detail }) => [guard, outcome, tool, detail])).toEqual([
            ["egress", "allow", "lookup", "allow"],
            ["source", "pass", "lookup", "would flag · instructions, unknown host"],
            ["approval", "ask", "lookup", "approval required"],
            ["signature", "flag", "lookup", "signature matched"],
            ["permission", "block", "exportAll", "permission denied"],
            ["action", "block", "payInvoice", "value not from allowed origin"],
        ]);
        expect(events[0]).toMatchObject({ at: SUPPORT_CALL, agent: "support", runId: support.runId });
        expect(events[5]).toMatchObject({ at: NOW - 3 * MINUTE, agent: "billing", runId: billing.runId });
        expect(new Set(events.map((event) => event.id)).size).toBe(6);
    });

    it("keeps the 12 newest decisions in the log", async () => {
        const blocks = Array.from({ length: 14 }, (_, n) =>
            decision(billing, stepId(n + 1), NOW - (14 - n) * MINUTE, {
                tool: "payInvoice",
                guard: "action",
                rule: "amount:max",
                decision: "block",
            }),
        );
        await showProject([started(billing, NOW - HOUR), ...blocks]);
        const { events } = await getOverview(NOW);

        expect(events.map((event) => event.at)).toEqual(Array.from({ length: 12 }, (_, n) => NOW - (12 - n) * MINUTE));
    });

    it("keeps each part at zero when the runs are older than its window", async () => {
        const old = NOW - 40 * DAY;
        await showProject([
            started(billing, old),
            modelCall(billing, stepId(1), old),
            toolCall(billing, stepId(2), old, "payInvoice"),
            decision(billing, stepId(2), old, { tool: "payInvoice", guard: "action", rule: "a", decision: "block" }),
        ]);

        expect(await getOverview(NOW)).toEqual(QUIET);
    });

    it("stops at the sign-in redirect for people who are not signed in", async () => {
        requireSession.mockRejectedValueOnce(new Error("redirect:/sign-in"));

        await expect(getOverview(NOW)).rejects.toThrow("redirect:/sign-in");
    });
});

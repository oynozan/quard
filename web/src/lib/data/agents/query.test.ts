// @vitest-environment node
import { createProject, ingestBatch } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
    ago,
    check,
    content,
    finish,
    items,
    model,
    runOf,
    start,
    stepOf,
    tool,
    WEB_PAGE,
} from "../../../../test/agents/events";
import { DAY, NOW } from "../../../../test/time";

const requireSession = vi.hoisted(() => vi.fn(async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 })));
const cache = vi.hoisted(() => vi.fn(<T>(fn: T) => fn));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("react", async (original) => {
    const react = await original<typeof import("react")>();
    // React is CommonJS, so named imports can resolve through its default export
    return { ...react, default: { ...react, cache }, cache };
});

const { getAgent, getAgentGraph } = await import("./query");
const { database } = await import("../runs/live/client");
// Vitest clears call history before each test, so keep what the import wrapped
const cached = cache.mock.results.map((result) => result.value);

const [NEW, EARLIER, QUIET, OLD] = [1, 2, 3, 4].map(runOf);
const [S1, S2, S3, S4, S5] = [1, 2, 3, 4, 5].map(stepOf);
const D3 = (3 * DAY) / 1000;
const D40 = (40 * DAY) / 1000;
let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
    vi.stubEnv("DATABASE_URL", test.url);
    vi.stubEnv("QUARD_PROJECT_ID", "");
    vi.spyOn(Date, "now").mockReturnValue(NOW);
}, 60_000);

afterAll(async () => {
    vi.restoreAllMocks();
    await database().destroy();
    vi.unstubAllEnvs();
    await test.stop();
});

// A fresh project with runs from just now back to 40 days ago
async function fleet(): Promise<void> {
    const projectId = await createProject(test.db, "Agents");
    vi.stubEnv("QUARD_PROJECT_ID", projectId);
    const delegate = [{ callId: "c1", name: "delegate", arguments: "{}" }];
    await ingestBatch(
        test.db,
        projectId,
        items([
            // Still going, orchestrator hands billing a poisoned invoice whose payment is asked and blocked
            start(NEW, "orchestrator", ago(60)),
            model(NEW, "orchestrator", S1, ago(50), { toolCalls: delegate }),
            content(NEW, "billing", S2, ago(45)),
            model(NEW, "billing", S2, ago(30), { parentStepId: S1 }),
            check(NEW, "billing", S3, ago(26), "ask", { guard: "approval", rule: "approval" }),
            check(NEW, "billing", S3, ago(26), "block"),
            check(NEW, "billing", S4, ago(24), "block", { mode: "observe", enforced: false }),
            tool(NEW, "billing", S3, ago(25), { status: "blocked", durationMs: 1000 }),
            tool(NEW, "orchestrator", S5, ago(20), { tool: "delegate" }),
            // Three days ago support handed work to helper
            start(EARLIER, "support", ago(D3)),
            model(EARLIER, "support", S1, ago(D3 - 1), { model: "claude-x", toolCalls: delegate }),
            model(EARLIER, "helper", S2, ago(D3 - 3), { parentStepId: S1 }),
            finish(EARLIER, "support", ago(D3 - 4)),
            // Never ended, but quiet for five minutes
            start(QUIET, "watcher", ago(400)),
            model(QUIET, "watcher", S1, ago(300)),
            // Older than the window
            start(OLD, "archive", ago(D40)),
            model(OLD, "archive", S1, ago(D40 - 1)),
            finish(OLD, "archive", ago(D40 - 2)),
        ]),
    );
}

const node = (name: string, state: string, model: string | null, runs24h: number, secondsAgo: number) => ({
    name,
    state,
    model,
    runs24h,
    lastSeenAt: NOW - secondsAgo * 1000,
});

const link = (from: string, to: string, untrusted: number, secondsAgo: number) => ({
    from,
    to,
    delegations: 1,
    handoffs: 0,
    messages: 0,
    total: 1,
    untrusted,
    untrustedShare: untrusted,
    lastAt: NOW - secondsAgo * 1000,
});

const poisoned = link("orchestrator", "billing", 1, 30);
const handed = link("support", "helper", 0, D3 - 3);

describe("agents from Postgres", () => {
    it("shows nothing before a project exists", async () => {
        expect(await getAgentGraph()).toEqual({ windowDays: 30, nodes: [], edges: [] });
        expect(await getAgent("billing")).toBeNull();
    });

    it("has no agents in a brand-new project", async () => {
        vi.stubEnv("QUARD_PROJECT_ID", await createProject(test.db, "New"));

        expect(await getAgentGraph()).toEqual({ windowDays: 30, nodes: [], edges: [] });
        expect(await getAgent("billing")).toBeNull();
    });

    it("draws every agent of the last 30 days and the delegations between them", async () => {
        await fleet();

        expect(await getAgentGraph()).toEqual({
            windowDays: 30,
            nodes: [
                node("billing", "running", "gpt-5.4-mini", 1, 24),
                node("helper", "idle", "gpt-5.4-mini", 0, D3 - 3),
                node("orchestrator", "running", "gpt-5.4-mini", 1, 20),
                node("support", "idle", "claude-x", 0, D3 - 4),
                node("watcher", "idle", "gpt-5.4-mini", 1, 300),
            ],
            edges: [poisoned, handed],
        });
        expect(requireSession).toHaveBeenCalled();
    });

    it("opens an agent with its last 24 hours, its links and its recent calls", async () => {
        await fleet();
        const detail = await getAgent("billing");

        expect(detail?.agent).toEqual(node("billing", "running", "gpt-5.4-mini", 1, 24));
        expect(detail?.stats).toEqual({
            modelCalls24h: 1,
            influencedShare: 1,
            costUsd24h: 0.003075,
            costKnown: true,
            asked24h: 1,
            blocked24h: 1,
        });
        expect(detail?.activity.startAt).toBe(Date.UTC(2026, 9, 2, 19));
        expect(detail?.activity.perHour).toEqual([...Array.from({ length: 23 }, () => 0), 1]);
        expect(detail?.links).toEqual([poisoned]);
        expect(detail?.timeline).toEqual([
            {
                runId: NEW,
                stepId: S3,
                at: NOW - 26_000,
                kind: "tool_call",
                name: "payInvoice",
                durationMs: 1000,
                status: "blocked",
                context: WEB_PAGE,
                outcome: "block",
                mode: "block",
            },
            {
                runId: NEW,
                stepId: S2,
                at: NOW - 31_000,
                kind: "model_call",
                name: "gpt-5.4-mini",
                durationMs: 1000,
                status: "ok",
                context: WEB_PAGE,
                outcome: null,
                mode: null,
            },
        ]);
        expect(detail?.versions).toEqual([]);
        expect(detail?.incidents).toEqual([]);
        expect((await getAgent("orchestrator"))?.links).toEqual([poisoned]);
    });

    it("counts only the last 24 hours, but links and calls from further back", async () => {
        await fleet();
        const detail = await getAgent("support");

        expect(detail?.agent).toEqual(node("support", "idle", "claude-x", 0, D3 - 4));
        expect(detail?.stats).toEqual({
            modelCalls24h: 0,
            influencedShare: null,
            costUsd24h: 0,
            costKnown: true,
            asked24h: 0,
            blocked24h: 0,
        });
        expect(detail?.activity.perHour.every((count) => count === 0)).toBe(true);
        expect(detail?.links).toEqual([handed]);
        expect(detail?.timeline.map((call) => [call.runId, call.name])).toEqual([[EARLIER, "claude-x"]]);
    });

    it("keeps an agent quiet for the whole window idle, with its older calls", async () => {
        await fleet();
        const detail = await getAgent("archive");

        expect(detail?.agent).toEqual(node("archive", "idle", null, 0, D40 - 2));
        expect(detail?.stats).toMatchObject({ modelCalls24h: 0, influencedShare: null });
        expect(detail?.links).toEqual([]);
        expect(detail?.timeline.map((call) => [call.runId, call.kind])).toEqual([[OLD, "model_call"]]);
    });

    it("finds only agents the project heard from, by their exact name", async () => {
        await fleet();

        expect(await getAgent("nobody")).toBeNull();
        expect(await getAgent("Billing")).toBeNull();
    });

    it("reads an agent once per request, since the page and its metadata both ask", () => {
        expect(cached).toEqual([getAgent]);
    });

    it("stops at the sign-in redirect for people who are not signed in", async () => {
        requireSession.mockRejectedValueOnce(new Error("redirect:/sign-in"));
        await expect(getAgentGraph()).rejects.toThrow("redirect:/sign-in");
        requireSession.mockRejectedValueOnce(new Error("redirect:/sign-in"));
        await expect(getAgent("billing")).rejects.toThrow("redirect:/sign-in");
    });
});

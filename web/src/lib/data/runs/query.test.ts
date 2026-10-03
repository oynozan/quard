// @vitest-environment node
import { createProject, ingestBatch } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const requireSession = vi.hoisted(() => vi.fn(async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 })));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const { getRun, listRuns, requestTime } = await import("./query");
const { database } = await import("./live/client");

const RUN = "b".repeat(32);
const OTHER = "c".repeat(32);
let test: TestDb;
let next = 0;
const id = () => (++next).toString(16).padStart(16, "d");
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 3, 12, 0, seconds)).toISOString();

beforeAll(async () => {
    test = await startTestDb();
    vi.stubEnv("DATABASE_URL", test.url);
}, 60_000);

afterAll(async () => {
    await database().destroy();
    vi.unstubAllEnvs();
    await test.stop();
});

// The poisoned-invoice run as webhook stores it: redacted, with hashed value keys
function attack(runId: string, agent: string, ended = false) {
    const base = { runId, agent };
    const events = [
        ...(ended ? [{ type: "run_finished", runId, agent, at: at(4), status: "completed" }] : []),
        { type: "run_started", runId, agent, at: at(0), origins: {} },
        {
            type: "model_call",
            ...base,
            stepId: "1".repeat(16),
            at: at(2),
            model: "gpt-5.4-mini",
            status: "ok",
            durationMs: 900,
            toolCalls: [{ callId: "c1", name: "payInvoice", arguments: "{}" }],
            usage: { inputTokens: 2000, cachedTokens: 1000, outputTokens: 500 },
        },
        {
            type: "content",
            ...base,
            stepId: "1".repeat(16),
            at: at(1.5),
            contentId: "c1",
            origin: "web:acme-billing.net",
            trust: "untrusted",
            sensitivity: "public",
            flags: [],
            keys: [`iban:GB33…5555#${"e".repeat(32)}`],
        },
        {
            type: "decision",
            ...base,
            stepId: "2".repeat(16),
            at: at(3),
            tool: "payInvoice",
            guard: "action",
            rule: "iban:from",
            decision: "block",
            mode: "block",
            enforced: true,
            reason: "value_not_from_allowed_origin",
            field: "iban",
        },
        {
            type: "tool_call",
            ...base,
            stepId: "2".repeat(16),
            at: at(3),
            tool: "payInvoice",
            callId: "c1",
            arguments: { iban: "GB33…5555", amount: 4950 },
            status: "blocked",
            influenced: true,
            flagged: false,
            durationMs: 0,
            keys: [`iban:GB33…5555#${"e".repeat(32)}`],
        },
    ];
    return events.map((event) => ({ id: id(), event: event as never }));
}

describe("runs from Postgres", () => {
    it("shows nothing before a project exists", async () => {
        expect(await listRuns()).toEqual([]);
        expect(await getRun(RUN)).toBeNull();
    });

    it("lists the project's runs and opens one, traced and redacted", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [...attack(RUN, "billing"), ...attack(OTHER, "support", true)]);

        const rows = await listRuns();
        expect(rows.map((row) => row.id).sort()).toEqual([RUN, OTHER].sort());
        expect(rows.find((row) => row.id === OTHER)).toMatchObject({
            status: "completed",
            durationMs: 4000,
            costUsd: 0.0031,
            costKnown: true,
        });
        expect(rows.find((row) => row.id === RUN)).toMatchObject({
            status: "blocked",
            decisions: { blocked: 1 },
            tools: ["payInvoice"],
        });

        const run = await getRun(RUN);
        const pay = run?.steps.find((step) => step.kind === "tool_call");
        expect(pay?.args[0]).toMatchObject({ value: "GB33…5555", valueLabel: { kind: "iban", traced: true } });
        expect(pay?.args[0]?.valueLabel.appearances[0]?.label.origin).toBe("web:acme-billing.net");
        expect(requireSession).toHaveBeenCalled();
        expect(await getRun("f".repeat(32))).toBeNull();
    });

    it("filters by agent, status and words, and limits the list", async () => {
        expect((await listRuns({ agent: "support" })).map((row) => row.id)).toEqual([OTHER]);
        expect(await listRuns({ status: "running" })).toEqual([]);
        expect((await listRuns({ query: "SUPPORT pay" })).map((row) => row.id)).toEqual([OTHER]);
        expect((await listRuns({ query: "bbbb" })).map((row) => row.id)).toEqual([RUN]);
        expect(await listRuns({ limit: 1 })).toHaveLength(1);
    });

    it("tells the time of the request", async () => {
        const before = Date.now();

        expect(await requestTime()).toBeGreaterThanOrEqual(before);
    });
});

// @vitest-environment node
import { createProject, ingestBatch } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { attack, scoredFetch } from "../../../../test/runs/events";

const requireSession = vi.hoisted(() => vi.fn(async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 })));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const { getRun, listRuns } = await import("./query");
const { database } = await import("./live/client");

const RUN = "b".repeat(32);
const OTHER = "c".repeat(32);
let test: TestDb;

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

    it("says which decisions came late and keeps a detector's score", async () => {
        const projectId = await createProject(test.db, "Scored");
        vi.stubEnv("QUARD_PROJECT_ID", projectId);
        await ingestBatch(test.db, projectId, [...attack(RUN, "billing"), ...scoredFetch(RUN, "billing")]);

        const checks = (await getRun(RUN))?.steps.flatMap((step) => (step.guard ? [step.guard] : []));
        vi.stubEnv("QUARD_PROJECT_ID", "");
        expect(checks?.map((guard) => [guard.guard, guard.degraded, guard.scan?.jevScore])).toEqual([
            ["action", false, undefined],
            ["source", true, 0.87],
        ]);
    });
});

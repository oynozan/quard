// @vitest-environment node
import { createProject, ingestBatch } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { at, attack, item } from "../../../../test/runs/events";

const requireSession = vi.hoisted(() => vi.fn(async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 })));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const { getRun } = await import("./query");
const { database } = await import("./live/client");

const RUN = "b".repeat(32);
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

describe("a run's messages, handoffs and memory in the run view", () => {
    it("reads them from Postgres into the steps and the run graph", async () => {
        const projectId = await createProject(test.db, "Acme");
        const base = { runId: RUN, agent: "billing" };
        await ingestBatch(test.db, projectId, [
            ...attack(RUN, "billing"),
            item({
                type: "message",
                ...base,
                stepId: "4".repeat(16),
                at: at(1),
                from: "unknown",
                verified: false,
                trust: "untrusted",
                sensitivity: "internal",
            }),
            item({
                type: "memory",
                ...base,
                stepId: "5".repeat(16),
                at: at(3),
                store: "notes",
                op: "write",
                items: 1,
                verified: 1,
                trust: "untrusted",
                sensitivity: "internal",
            }),
        ]);

        const run = await getRun(RUN);
        expect(run?.steps.map((step) => step.kind)).toEqual([
            "message",
            "model_call",
            "tool_call",
            "guard_decision",
            "memory_write",
        ]);
        expect(run?.steps[0]).toMatchObject({ name: "unknown → billing", detail: "Unverified · read as untrusted" });
        expect(run?.graph.edges).toEqual([
            expect.objectContaining({ from: "unknown", to: "billing", untrusted: true }),
        ]);
    });
});

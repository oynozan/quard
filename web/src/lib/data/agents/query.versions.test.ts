// @vitest-environment node
import { createProject, ingestBatch } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ago, items, model, runOf, start, stepOf } from "../../../../test/agents/events";
import { seenVersion } from "../../../../test/agents/versions";
import { DAY, HOUR, NOW } from "../../../../test/time";

vi.mock("@/lib/auth/session", () => ({
    requireSession: async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 }),
}));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("react", async (original) => {
    const react = await original<typeof import("react")>();
    const cache = <T>(fn: T) => fn;
    // React is CommonJS, so named imports can resolve through its default export
    return { ...react, default: { ...react, cache }, cache };
});

const { getAgent } = await import("./query");
const { database } = await import("../runs/live/client");

// Version hashes made from a number
const versionOf = (n: number): string => n.toString(16).padStart(16, "0");

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
    vi.stubEnv("DATABASE_URL", test.url);
    vi.spyOn(Date, "now").mockReturnValue(NOW);
}, 60_000);

afterAll(async () => {
    vi.restoreAllMocks();
    await database().destroy();
    vi.unstubAllEnvs();
    await test.stop();
});

// A new project the dashboard reads, where billing made one model call
async function billing(): Promise<string> {
    const projectId = await createProject(test.db, "Versions");
    vi.stubEnv("QUARD_PROJECT_ID", projectId);
    const run = runOf(1);
    await ingestBatch(
        test.db,
        projectId,
        items([start(run, "billing", ago(60)), model(run, "billing", stepOf(1), ago(50))]),
    );
    return projectId;
}

describe("agent versions from Postgres", () => {
    it("lists an agent's versions newest first, the older one live until the newer one appeared", async () => {
        const projectId = await billing();
        const first = {
            agent: "billing",
            version: "1".repeat(16),
            model: "gpt-5.4-mini",
            tools: ["payInvoice"],
            instructions: "Pay approved invoices.",
        };
        await seenVersion(test.db, projectId, first, NOW - 10 * DAY);
        const second = {
            ...first,
            version: "2".repeat(16),
            tools: ["payInvoice", "fetchPage"],
            instructions: undefined,
        };
        await seenVersion(test.db, projectId, second, NOW - 2 * DAY);
        // Another agent's version stays on its own page
        await seenVersion(test.db, projectId, { ...first, agent: "support", version: "3".repeat(16) }, NOW - DAY);

        expect((await getAgent("billing"))?.versions).toEqual([
            {
                version: "2".repeat(16),
                model: "gpt-5.4-mini",
                instructionsHash: null,
                tools: ["payInvoice", "fetchPage"],
                toolsBefore: ["payInvoice"],
                since: NOW - 2 * DAY,
                until: null,
                note: "",
                current: true,
                incidents: [],
            },
            {
                version: "1".repeat(16),
                model: "gpt-5.4-mini",
                // The first 16 hex characters of the SHA-256 of "Pay approved invoices."
                instructionsHash: "c452794b8ad8444b",
                tools: ["payInvoice"],
                toolsBefore: null,
                since: NOW - 10 * DAY,
                until: NOW - 2 * DAY,
                note: "",
                current: false,
                incidents: [],
            },
        ]);
    });

    it("lists the newest 100, the oldest of them still compared with the version before it", async () => {
        const projectId = await billing();
        // 101 versions an hour apart, where only the oldest could also fetch pages
        await test.db
            .insertInto("agent_versions")
            .values(
                Array.from({ length: 101 }, (_, n) => ({
                    project_id: projectId,
                    agent: "billing",
                    version: versionOf(n),
                    model: "gpt-5.4",
                    tools: n === 0 ? ["payInvoice", "fetchPage"] : ["payInvoice"],
                    first_seen_at: new Date(NOW - (101 - n) * HOUR),
                })),
            )
            .execute();

        const versions = (await getAgent("billing"))?.versions ?? [];
        expect(versions).toHaveLength(100);
        expect(versions[0]?.version).toBe(versionOf(100));
        expect(versions[99]).toMatchObject({
            version: versionOf(1),
            toolsBefore: ["payInvoice", "fetchPage"],
        });
    });
});

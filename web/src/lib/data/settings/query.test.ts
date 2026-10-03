// @vitest-environment node
import { createAgentKey, createProject, ingestBatch } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runId, runStarted } from "../../../../test/settings/events";
import { DAY, HOUR, MINUTE, NOW } from "../../../../test/time";
import { retentionRows } from "./retention";

const requireSession = vi.hoisted(() => vi.fn(async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 })));
const projectSettings = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
// The real queries, with a way to make the project disappear between reads
vi.mock("@quard/db", async (importOriginal) => {
    const real = await importOriginal<typeof import("@quard/db")>();
    projectSettings.mockImplementation(real.projectSettings);
    return { ...real, projectSettings };
});

const { getSettings } = await import("./query");
const { database } = await import("../runs/live/client");

const EMPTY = { hasProject: false, keys: [], retention: [], origins: [], rules: [], sdks: [] };
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

// A new project, made the one the dashboard reads
async function project(name: string): Promise<string> {
    const id = await createProject(test.db, name);
    vi.stubEnv("QUARD_PROJECT_ID", id);
    return id;
}

async function stamp(id: string, times: { created_at: Date; last_used_at?: Date; revoked_at?: Date }) {
    await test.db.updateTable("agent_keys").set(times).where("id", "=", id).execute();
}

describe("getSettings", () => {
    it("is empty on a new install, after checking sign-in", async () => {
        expect(await getSettings()).toEqual(EMPTY);
        expect(requireSession).toHaveBeenCalled();
    });

    it("lists the project's keys newest first, in ms, without their secrets", async () => {
        const id = await project("Keys");
        const old = await createAgentKey(test.db, id, "billing");
        const fresh = await createAgentKey(test.db, id, "support");
        const elsewhere = await createAgentKey(test.db, await createProject(test.db, "Other"), "other");
        await stamp(old.id, { created_at: new Date(NOW - 2 * DAY) });
        await stamp(fresh.id, {
            created_at: new Date(NOW - DAY),
            last_used_at: new Date(NOW - 5 * MINUTE),
            revoked_at: new Date(NOW - MINUTE),
        });

        const settings = await getSettings();
        expect(settings.hasProject).toBe(true);
        expect(settings.keys).toEqual([
            {
                id: fresh.id,
                name: "support",
                prefix: fresh.prefix,
                createdAt: NOW - DAY,
                lastUsedAt: NOW - 5 * MINUTE,
                revokedAt: NOW - MINUTE,
            },
            {
                id: old.id,
                name: "billing",
                prefix: old.prefix,
                createdAt: NOW - 2 * DAY,
                lastUsedAt: null,
                revokedAt: null,
            },
        ]);
        expect(old.prefix).toMatch(/^qk_live_[0-9a-f]{4}$/);
        expect(JSON.stringify(settings)).not.toContain(old.key);
        expect(settings.keys.some((key) => key.id === elsewhere.id)).toBe(false);
        expect(settings.retention).toEqual(retentionRows(30));
        expect([settings.origins, settings.rules, settings.sdks]).toEqual([[], [], []]);
    });

    it("keeps runs for the project's own number of days", async () => {
        const id = await project("Retention");
        await test.db.updateTable("projects").set({ retention_days: 7 }).where("id", "=", id).execute();

        expect((await getSettings()).retention).toEqual(retentionRows(7));
    });

    it("shows each origin override beside its default, which fills a side it left out", async () => {
        const id = await project("Origins");
        await ingestBatch(test.db, id, [
            runStarted(runId(1), "billing", NOW - 2 * HOUR, {
                "mcp:crm.internal": { trust: "trusted", sensitivity: "internal" },
            }),
            // The newest run that sets an override decides what is in force
            runStarted(runId(2), "support", NOW - HOUR, { "mcp:crm.internal": { trust: "trusted" } }),
            runStarted(runId(3), "billing", NOW - 3 * HOUR, { "web:docs.example.com": { sensitivity: "internal" } }),
            runStarted(runId(4), "support", NOW - MINUTE, {}),
        ]);

        expect((await getSettings()).origins).toEqual([
            {
                origin: "mcp:crm.internal",
                trust: "trusted",
                sensitivity: "public",
                defaultTrust: "untrusted",
                defaultSensitivity: "public",
                agents: ["billing", "support"],
                seenAt: NOW - HOUR,
            },
            {
                origin: "web:docs.example.com",
                trust: "untrusted",
                sensitivity: "internal",
                defaultTrust: "untrusted",
                defaultSensitivity: "public",
                agents: ["billing"],
                seenAt: NOW - 3 * HOUR,
            },
        ]);
    });

    it("is empty when the project is removed between the two reads", async () => {
        await project("Removed");
        projectSettings.mockResolvedValueOnce(undefined);

        expect(await getSettings()).toEqual(EMPTY);
    });

    it("stops at the sign-in redirect for people who are not signed in", async () => {
        requireSession.mockRejectedValueOnce(new Error("redirect:/sign-in"));

        await expect(getSettings()).rejects.toThrow("redirect:/sign-in");
    });
});

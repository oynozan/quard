// @vitest-environment node
import { createProject, recordConfigErrors, recordDropped } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DAY, HOUR, MINUTE, NOW } from "../../../test/time";

vi.mock("@/lib/auth/session", () => ({ requireSession: async () => ({ sub: "did:privy:1" }) }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const { getSdkReports } = await import("./sdk-reports");
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

// A fresh project for the dashboard to show
async function showProject(): Promise<string> {
    const id = await createProject(test.db, `Project ${++projects}`);
    vi.stubEnv("QUARD_PROJECT_ID", id);
    return id;
}

const at = (time: number) => new Date(time);

describe("getSdkReports", () => {
    it("reports nothing before a project exists, or when its SDKs reported nothing", async () => {
        const none = { configErrors: [], dropped: null };
        expect(await getSdkReports(NOW)).toEqual(none);
        await showProject();
        expect(await getSdkReports(NOW)).toEqual(none);
    });

    it("lists the five config errors seen last, newest first, with how often each came", async () => {
        const id = await showProject();
        const broken = { source: "policy" as const, message: "Unexpected token in policy.json" };
        await recordConfigErrors(test.db, id, [broken, broken], at(NOW - 3 * HOUR));
        await recordConfigErrors(test.db, id, [broken], at(NOW - HOUR));
        const feeds = Array.from({ length: 5 }, (_, n) => ({ source: "signatures" as const, message: `feed ${n}` }));
        for (const [n, feed] of feeds.entries()) {
            await recordConfigErrors(test.db, id, [feed], at(NOW - (2 + n) * HOUR));
        }

        expect(await getSdkReports(NOW)).toEqual({
            configErrors: [
                { source: "policy", message: broken.message, lastSeenAt: NOW - HOUR, count: 3 },
                ...feeds.slice(0, 4).map((feed, n) => ({ ...feed, lastSeenAt: NOW - (2 + n) * HOUR, count: 1 })),
            ],
            dropped: null,
        });
    });

    it("counts the events SDKs dropped in the last 24 hours", async () => {
        const id = await showProject();
        await recordDropped(test.db, id, "a".repeat(16), 40, at(NOW - DAY - MINUTE));
        await recordDropped(test.db, id, "b".repeat(16), 12, at(NOW - 5 * HOUR));
        await recordDropped(test.db, id, "c".repeat(16), 3, at(NOW - MINUTE));

        expect((await getSdkReports(NOW)).dropped).toEqual({ count: 15, lastAt: NOW - MINUTE });
    });
});

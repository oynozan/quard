// @vitest-environment node
import { createProject } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const requireSession = vi.hoisted(() => vi.fn(async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 })));
const connection = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("next/server", () => ({ connection }));

const { projectScope, requestTime } = await import("./scope");
const { database } = await import("./runs/live/client");

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

describe("requestTime", () => {
    it("tells the time of the request, at request time only", async () => {
        connection.mockClear();
        const before = Date.now();

        expect(await requestTime()).toBeGreaterThanOrEqual(before);
        expect(connection).toHaveBeenCalledTimes(1);
    });
});

describe("projectScope", () => {
    it("has no scope before a project exists", async () => {
        connection.mockClear();
        requireSession.mockClear();

        expect(await projectScope()).toBeNull();
        expect(connection).toHaveBeenCalledTimes(1);
        expect(requireSession).toHaveBeenCalledTimes(1);
    });

    it("gives the shared database and the install's first project", async () => {
        const id = await createProject(test.db, "Acme");
        const scope = await projectScope();

        expect(scope?.project).toMatchObject({ id, name: "Acme" });
        expect(scope?.db).toBe(database());
    });

    it("follows QUARD_PROJECT_ID to another project", async () => {
        const id = await createProject(test.db, "Staging");
        vi.stubEnv("QUARD_PROJECT_ID", id);

        expect((await projectScope())?.project).toMatchObject({ id, name: "Staging" });
    });

    it("stops at the sign-in redirect for people who are not signed in", async () => {
        requireSession.mockRejectedValueOnce(new Error("redirect:/sign-in"));

        await expect(projectScope()).rejects.toThrow("redirect:/sign-in");
    });
});

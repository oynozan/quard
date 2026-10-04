// @vitest-environment node
import { chunkQueue, createProject, ingestBatch, reviewedChunks } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { redirect } from "next/navigation";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/session-token";
import { chunkLabel, item, started } from "../../../../../db/test/events";

const signedIn = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("@/lib/auth/session", () => ({
    requireSession: async () => signedIn.session ?? redirect("/sign-in"),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const { reviewLabel } = await import("./actions");
const { database } = await import("../runs/live/client");

const EVENT = "c".repeat(16);
let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
    vi.stubEnv("DATABASE_URL", test.url);
}, 60_000);

afterEach(() => {
    signedIn.session = { sub: "did:privy:1", email: null, github: "dana-k", exp: 0 };
    cache.revalidatePath.mockClear();
});

afterAll(async () => {
    await database().destroy();
    vi.unstubAllEnvs();
    await test.stop();
});

describe("reviewLabel", () => {
    it("sends a visitor without a session to sign in before reading anything", async () => {
        await expect(reviewLabel(EVENT, "invoice")).rejects.toThrow("NEXT_REDIRECT");
        expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it("turns away a bad chunk id or label name", async () => {
        for (const id of ["abc", "C".repeat(16), 42 as never]) {
            await expect(reviewLabel(id, "invoice")).rejects.toThrow("Not a chunk id");
        }
        for (const label of ["Invoice", "a".repeat(41), null as never]) {
            await expect(reviewLabel(EVENT, label)).rejects.toThrow("Not a label name");
        }
    });

    it("finds nothing before a project exists", async () => {
        expect(await reviewLabel(EVENT, "invoice")).toBe(false);
        expect(cache.revalidatePath).toHaveBeenCalledWith("/labels");
    });

    it("saves the right label with who chose it, and reloads the Labels page", async () => {
        const projectId = await createProject(test.db, "Acme");
        const chunk = item(chunkLabel());
        await ingestBatch(test.db, projectId, [item(started()), chunk]);

        expect(await reviewLabel(chunk.id, "invoice")).toBe(true);

        expect(cache.revalidatePath).toHaveBeenCalledWith("/labels");
        expect(await chunkQueue(test.db, projectId)).toEqual([]);
        const [reviewed] = await reviewedChunks(test.db, projectId);
        expect(reviewed?.review).toMatchObject({ label: "invoice", by: "@dana-k" });
        expect(await reviewLabel(EVENT, "invoice")).toBe(false);
    });
});

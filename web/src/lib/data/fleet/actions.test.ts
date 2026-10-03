// @vitest-environment node
import { createProject, listQuarantined, recordFleetUse } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { redirect } from "next/navigation";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/session-token";

const signedIn = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("@/lib/auth/session", () => ({
    requireSession: async () => signedIn.session ?? redirect("/sign-in"),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const { markKnown } = await import("./actions");
const { database } = await import("../runs/live/client");

const IBAN = { field: "iban", kind: "iban", key: `iban:GB33…5555#${"e".repeat(32)}` } as const;
const runId = (n: number) => n.toString(16).padStart(32, "0");
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

describe("markKnown", () => {
    it("sends a visitor without a session to sign in before reading anything", async () => {
        await expect(markKnown("not a key")).rejects.toThrow("NEXT_REDIRECT");
        expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it("turns away anything that is not a fleet value key", async () => {
        const bad = [
            "iban:GB33",
            `iban:GB33 5555#${"e".repeat(32)}`,
            `card:4111…1111#${"e".repeat(32)}`,
            "domain:Evil.com",
        ];
        for (const key of [...bad, `domain:${"a".repeat(500)}`, 42 as never]) {
            await expect(markKnown(key)).rejects.toThrow("Not a fleet value key");
        }
    });

    it("finds nothing before a project exists", async () => {
        expect(await markKnown(IBAN.key)).toBe(false);
        expect(cache.revalidatePath).toHaveBeenCalledWith("/summary");
    });

    it("lifts a quarantined value, keeps who checked it, and reloads the Summary page", async () => {
        const projectId = await createProject(test.db, "Acme");
        for (let n = 1; n <= 5; n += 1) {
            const use = { runId: runId(n), agent: "billing", tool: "payInvoice", blocked: false, values: [IBAN] };
            await recordFleetUse(test.db, projectId, use);
        }
        expect(await listQuarantined(test.db, projectId)).toHaveLength(1);

        expect(await markKnown(IBAN.key)).toBe(true);
        expect(cache.revalidatePath).toHaveBeenCalledWith("/summary");
        expect(await listQuarantined(test.db, projectId)).toEqual([]);
        const row = await test.db
            .selectFrom("fleet_values")
            .select("known_by")
            .where("key", "=", IBAN.key)
            .executeTakeFirstOrThrow();
        expect(row.known_by).toBe("@dana-k");
        expect(await markKnown("domain:unknown.example")).toBe(false);
    });
});

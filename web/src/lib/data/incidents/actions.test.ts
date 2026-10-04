// @vitest-environment node
import { createProject, getIncident, ingestBatch, listIncidents, saveReplay, saveVerdict } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { redirect } from "next/navigation";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/auth/session-token";
import { storedReplay, storedVerdict } from "../../../../test/incidents/rows";
import { attack } from "../../../../test/runs/events";

const DANA: Session = { sub: "did:privy:1", email: "dana@acme.com", github: null, exp: 0 };
const signedIn = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock("@/lib/auth/session", () => ({
    requireSession: async () => signedIn.session ?? redirect("/sign-in"),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const { markIncidentSeen, replayIncident } = await import("./actions");
const { database } = await import("../runs/live/client");

const RUN = "b".repeat(32);
const MISSING = "inc_0123456789abcdef";
const NO_PROJECT = "00000000-0000-0000-0000-000000000000";
let test: TestDb;
let projectId = "";

beforeAll(async () => {
    test = await startTestDb();
    vi.stubEnv("DATABASE_URL", test.url);
}, 60_000);

afterEach(() => {
    signedIn.session = DANA;
    cache.revalidatePath.mockClear();
});

afterAll(async () => {
    await database().destroy();
    vi.unstubAllEnvs();
    await test.stop();
});

// What the worker reads to pick up the replay
async function stored(id: string) {
    return test.db
        .selectFrom("incidents")
        .select(["replay_state", "replay_requested_by", "cap_usd"])
        .where("project_id", "=", projectId)
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
}

describe("replayIncident", () => {
    it("sends a visitor without a session to sign in before reading anything", async () => {
        await expect(replayIncident("not an id")).rejects.toThrow("NEXT_REDIRECT");
        expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it("turns away anything that is not an incident id", async () => {
        await expect(replayIncident("inc_123")).rejects.toThrow("Not an incident id");
        await expect(replayIncident(42 as never)).rejects.toThrow("Not an incident id");
    });

    it("finds nothing before a project exists", async () => {
        expect(await replayIncident(MISSING)).toBe("not_found");
        expect(cache.revalidatePath).toHaveBeenCalledWith(`/incidents/${MISSING}`);
    });

    it("waits for the verdict, then starts once, signed with who asked, and reloads the page", async () => {
        projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, attack(RUN, "billing"));
        const [{ id }] = await listIncidents(test.db, projectId, { limit: 1 });
        expect(await replayIncident(id)).toBe("not_ready");

        await saveVerdict(test.db, projectId, id, storedVerdict());
        expect(await replayIncident(id, null as never)).toBe("started");
        expect(cache.revalidatePath).toHaveBeenCalledWith(`/incidents/${id}`);
        expect(await stored(id)).toEqual({
            replay_state: "requested",
            replay_requested_by: "dana@acme.com",
            cap_usd: 5,
        });
        expect(await replayIncident(id)).toBe("running");
        expect(await replayIncident(MISSING)).toBe("not_found");
    });

    it("continues past the cap only when asked, with $5 more", async () => {
        const [{ id }] = await listIncidents(test.db, projectId, { limit: 1 });
        await saveReplay(test.db, projectId, id, storedReplay({ outcome: "cap reached" }), 5, "done");

        expect(await replayIncident(id)).toBe("decided");
        expect(await replayIncident(id, { raiseCap: true })).toBe("started");
        expect(await stored(id)).toMatchObject({ replay_state: "requested", cap_usd: 10 });
    });
});

describe("markIncidentSeen", () => {
    const seenAt = async (id: string) => (await getIncident(test.db, projectId, id))?.seenAt;

    // A new incident nobody has opened or replayed
    async function freshIncident(runId: string): Promise<string> {
        await ingestBatch(test.db, projectId, attack(runId, "billing"));
        const rows = await listIncidents(test.db, projectId, { limit: 10 });
        return rows.find((row) => row.runId === runId)!.id;
    }

    it("sends a visitor without a session to sign in before reading anything", async () => {
        signedIn.session = null;
        await expect(markIncidentSeen("not an id")).rejects.toThrow("NEXT_REDIRECT");
        expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it("turns away anything that is not an incident id", async () => {
        await expect(markIncidentSeen("inc_123")).rejects.toThrow("Not an incident id");
        await expect(markIncidentSeen(42 as never)).rejects.toThrow("Not an incident id");
        expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it("leaves incidents alone while the dashboard's project is missing", async () => {
        const id = await freshIncident("c".repeat(32));
        vi.stubEnv("QUARD_PROJECT_ID", NO_PROJECT);
        try {
            await markIncidentSeen(id);
        } finally {
            vi.stubEnv("QUARD_PROJECT_ID", "");
        }
        expect(await seenAt(id)).toBeNull();
        expect(cache.revalidatePath).toHaveBeenCalledWith("/incidents");
    });

    it("keeps the first time someone opened the incident, and reloads the list", async () => {
        const id = await freshIncident("d".repeat(32));
        expect(await seenAt(id)).toBeNull();
        await markIncidentSeen(id);
        const first = await seenAt(id);
        expect(first).toBeInstanceOf(Date);
        expect(cache.revalidatePath).toHaveBeenCalledWith("/incidents");

        await markIncidentSeen(id);
        expect(await seenAt(id)).toEqual(first);
        await expect(markIncidentSeen(MISSING)).resolves.toBeUndefined();
    });
});

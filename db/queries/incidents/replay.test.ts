import type { Updateable } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IncidentsTable } from "../../schema/database.ts";
import { blockedRun, replay } from "../../test/incidents.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { getIncident } from "./list.ts";
import { requestReplay } from "./replay.ts";
import type { StoredReplay } from "./types.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const BY = { by: "dana@acme.com" };

// An incident with its verdict found, and these fields
async function incident(fields: Updateable<IncidentsTable> = {}): Promise<{ projectId: string; id: string }> {
    const projectId = await createProject(test.db, "Acme");
    const id = await blockedRun(test.db, projectId);
    await test.db
        .updateTable("incidents")
        .set({ find_state: "done", run_after: new Date("2026-01-01T00:00:00.000Z"), ...fields })
        .where("id", "=", id)
        .execute();
    return { projectId, id };
}

const after = (saved: StoredReplay) => ({ replay_state: "done" as const, replay: JSON.stringify(saved) });

async function job(id: string) {
    return test.db
        .selectFrom("incidents")
        .select(["run_after as runAfter", "replay_requested_by as by"])
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
}

describe("requestReplay", () => {
    it("starts a replay that never ran, now", async () => {
        const { projectId, id } = await incident();

        expect(await requestReplay(test.db, projectId, id, BY)).toBe("started");

        expect(await getIncident(test.db, projectId, id)).toMatchObject({ replayState: "requested", replay: null });
        const requested = await job(id);
        expect(requested.by).toBe("dana@acme.com");
        expect(requested.runAfter.getTime()).toBeGreaterThan(Date.now() - 60_000);
        expect(await requestReplay(test.db, projectId, id, BY)).toBe("running");
    });

    it("starts a failed replay again, clearing its error", async () => {
        const { projectId, id } = await incident({ ...after(replay({ error: "boom" })), replay_state: "failed" });

        expect(await requestReplay(test.db, projectId, id, BY)).toBe("started");

        expect(await getIncident(test.db, projectId, id)).toMatchObject({
            replayState: "requested",
            replay: { error: null },
            capUsd: 5,
        });
    });

    it("says running while a replay runs", async () => {
        const { projectId, id } = await incident({ replay_state: "running" });

        expect(await requestReplay(test.db, projectId, id, BY)).toBe("running");
    });

    it("leaves a replay that answered or can't run", async () => {
        for (const outcome of ["confirmed", "not confirmed", "could not reproduce"] as const) {
            const { projectId, id } = await incident(after(replay({ outcome })));
            expect(await requestReplay(test.db, projectId, id, { ...BY, raiseCapUsd: 5 })).toBe("decided");
        }
        const limited = replay({ limited: "Replay limited: the turning-point request was not recorded" });
        const { projectId, id } = await incident({ ...after(limited), replay_state: "failed" });
        expect(await requestReplay(test.db, projectId, id, BY)).toBe("decided");
        expect(await getIncident(test.db, projectId, id)).toMatchObject({ replayState: "failed" });
    });

    it("goes on past the cap only when the cap is raised", async () => {
        const { projectId, id } = await incident(after(replay({ outcome: "cap reached" })));

        expect(await requestReplay(test.db, projectId, id, BY)).toBe("decided");
        expect(await requestReplay(test.db, projectId, id, { ...BY, raiseCapUsd: -5 })).toBe("decided");
        expect(await requestReplay(test.db, projectId, id, { ...BY, raiseCapUsd: Infinity })).toBe("decided");
        expect(await getIncident(test.db, projectId, id)).toMatchObject({ replayState: "done", capUsd: 5 });

        expect(await requestReplay(test.db, projectId, id, { ...BY, raiseCapUsd: 5 })).toBe("started");
        expect(await getIncident(test.db, projectId, id)).toMatchObject({
            replayState: "requested",
            capUsd: 10,
            replay: { outcome: "cap reached" },
        });
    });

    it("waits for the verdict, and finds nothing in another project", async () => {
        const { projectId, id } = await incident({ find_state: "pending" });

        expect(await requestReplay(test.db, projectId, id, BY)).toBe("not_ready");
        expect(await requestReplay(test.db, projectId, "inc_0000000000000000", BY)).toBe("not_found");
        const other = await createProject(test.db, "Other");
        expect(await requestReplay(test.db, other, id, BY)).toBe("not_found");
    });
});

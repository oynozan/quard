import { readFile } from "node:fs/promises";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decision, item, RUN, started } from "../../test/events.ts";
import { blockedRun, incidentId } from "../../test/incidents.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

async function opened(projectId: string) {
    return test.db
        .selectFrom("incidents")
        .select(["id", "run_id as runId", "opened_at as openedAt", "find_state as findState"])
        .where("project_id", "=", projectId)
        .orderBy("run_id")
        .execute();
}

const OTHER_RUN = "4".repeat(32);

describe("opening incidents at ingest", () => {
    it("opens one incident for a blocked run, at its earliest block", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [
            item(started()),
            item(decision("2026-10-03T12:00:05.000Z")),
            item(decision("2026-10-03T12:00:02.000Z")),
        ]);

        const [incident, ...rest] = await opened(projectId);
        expect(rest).toEqual([]);
        expect(incident).toMatchObject({ id: incidentId(projectId), runId: RUN, findState: "pending" });
        expect(incident?.openedAt.toISOString()).toBe("2026-10-03T12:00:02.000Z");
    });

    it("opens one for a block in observe mode, and none for allows", async () => {
        const projectId = await createProject(test.db, "Acme");
        const observed = { ...decision(), runId: OTHER_RUN, mode: "observe" as const, enforced: false };
        const allowed = { ...decision(), decision: "allow" as const };
        await ingestBatch(test.db, projectId, [
            item(started()),
            item(allowed),
            item({ ...started(), runId: OTHER_RUN }),
            item(observed),
        ]);

        expect(await opened(projectId)).toEqual([expect.objectContaining({ runId: OTHER_RUN })]);
    });

    it("keeps the first incident when later blocks arrive", async () => {
        const projectId = await createProject(test.db, "Acme");
        await blockedRun(test.db, projectId, RUN, "2026-10-03T12:00:05.000Z");
        await blockedRun(test.db, projectId, RUN, "2026-10-03T12:00:01.000Z");

        const incidents = await opened(projectId);
        expect(incidents).toHaveLength(1);
        expect(incidents[0]?.openedAt.toISOString()).toBe("2026-10-03T12:00:05.000Z");
    });

    it("gives each run its own incident, per project", async () => {
        const one = await createProject(test.db, "One");
        const two = await createProject(test.db, "Two");
        await blockedRun(test.db, one);
        await blockedRun(test.db, one, OTHER_RUN);
        await blockedRun(test.db, two);

        expect((await opened(one)).map((row) => row.id)).toEqual([incidentId(one), incidentId(one, OTHER_RUN)]);
        expect((await opened(two)).map((row) => row.id)).toEqual([incidentId(two)]);
        expect(incidentId(one)).not.toBe(incidentId(two));
    });

    it("goes when its run goes", async () => {
        const projectId = await createProject(test.db, "Acme");
        await blockedRun(test.db, projectId);

        await test.db.deleteFrom("runs").where("project_id", "=", projectId).execute();
        expect(await opened(projectId)).toEqual([]);
    });
});

describe("the 0008 migration", () => {
    it("opens incidents for runs blocked before it, with the ids ingest gives", async () => {
        const projectId = await createProject(test.db, "Acme");
        await blockedRun(test.db, projectId, RUN, "2026-10-03T12:00:03.000Z");
        await blockedRun(test.db, projectId, RUN, "2026-10-03T12:00:02.000Z");
        await ingestBatch(test.db, projectId, [
            item({ ...started(), runId: OTHER_RUN }),
            item({ ...decision(), runId: OTHER_RUN, decision: "allow" }),
        ]);
        await test.db.deleteFrom("incidents").where("project_id", "=", projectId).execute();

        const file = await readFile(new URL("../../migrations/0009_incidents.sql", import.meta.url), "utf8");
        const backfill = file.slice(file.indexOf("INSERT INTO incidents"));
        await sql.raw(backfill).execute(test.db);
        await sql.raw(backfill).execute(test.db);

        const [incident, ...rest] = await opened(projectId);
        expect(rest).toEqual([]);
        expect(incident).toMatchObject({ id: incidentId(projectId), runId: RUN, findState: "pending" });
        expect(incident?.openedAt.toISOString()).toBe("2026-10-03T12:00:02.000Z");
    });
});

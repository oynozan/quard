import { readFile } from "node:fs/promises";
import { sql, type Updateable } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IncidentsTable } from "../../schema/database.ts";
import { RUN } from "../../test/events.ts";
import { blockedRun } from "../../test/incidents.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { getIncident } from "./list.ts";
import { markIncidentSeen } from "./seen.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const OTHER_RUN = "4".repeat(32);
const THIRD_RUN = "5".repeat(32);

async function change(id: string, fields: Updateable<IncidentsTable>) {
    await test.db.updateTable("incidents").set(fields).where("id", "=", id).execute();
}

async function seenAt(projectId: string, id: string): Promise<Date | null | undefined> {
    return (await getIncident(test.db, projectId, id))?.seenAt;
}

describe("markIncidentSeen", () => {
    it("records when the incident's page was first opened", async () => {
        const projectId = await createProject(test.db, "Acme");
        const id = await blockedRun(test.db, projectId);
        expect(await seenAt(projectId, id)).toBeNull();

        await markIncidentSeen(test.db, projectId, id);

        const seen = await seenAt(projectId, id);
        expect(seen).toBeInstanceOf(Date);
        expect(seen?.getTime()).toBeGreaterThan(Date.now() - 60_000);
    });

    it("keeps the first time when the page is opened again", async () => {
        const projectId = await createProject(test.db, "Acme");
        const id = await blockedRun(test.db, projectId);
        const first = new Date("2026-10-03T12:30:00.000Z");
        await change(id, { seen_at: first });

        await markIncidentSeen(test.db, projectId, id);

        expect(await seenAt(projectId, id)).toEqual(first);
    });

    it("marks only that incident, and only in its own project", async () => {
        const projectId = await createProject(test.db, "Acme");
        const id = await blockedRun(test.db, projectId);
        const other = await blockedRun(test.db, projectId, OTHER_RUN);
        const elsewhere = await createProject(test.db, "Other");

        await markIncidentSeen(test.db, elsewhere, id);
        expect(await seenAt(projectId, id)).toBeNull();

        await markIncidentSeen(test.db, projectId, id);
        expect(await seenAt(projectId, id)).toBeInstanceOf(Date);
        expect(await seenAt(projectId, other)).toBeNull();
    });
});

describe("the 0013 migration", () => {
    it("counts incidents with a replay as seen when they opened, and no others", async () => {
        const projectId = await createProject(test.db, "Acme");
        const idle = await blockedRun(test.db, projectId, RUN, "2026-10-03T12:00:00.000Z");
        const requested = await blockedRun(test.db, projectId, OTHER_RUN, "2026-10-03T12:01:00.000Z");
        const failed = await blockedRun(test.db, projectId, THIRD_RUN, "2026-10-03T12:02:00.000Z");
        await change(requested, { find_state: "done", replay_state: "requested" });
        await change(failed, { find_state: "done", replay_state: "failed" });

        const file = await readFile(new URL("../../migrations/0013_incident_seen.sql", import.meta.url), "utf8");
        await sql.raw(file.slice(file.indexOf("UPDATE incidents"))).execute(test.db);

        expect(await seenAt(projectId, idle)).toBeNull();
        expect(await seenAt(projectId, requested)).toEqual(new Date("2026-10-03T12:01:00.000Z"));
        expect(await seenAt(projectId, failed)).toEqual(new Date("2026-10-03T12:02:00.000Z"));
    });
});

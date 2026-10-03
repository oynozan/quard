import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { item, started } from "../../test/events.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { hasRuns } from "./has-runs.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("hasRuns", () => {
    it("is false for a new project, and true once a run is stored", async () => {
        const projectId = await createProject(test.db, "Acme");
        expect(await hasRuns(test.db, projectId)).toBe(false);

        await ingestBatch(test.db, projectId, [item(started())]);
        expect(await hasRuns(test.db, projectId)).toBe(true);
    });

    it("leaves out other projects' runs", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await ingestBatch(test.db, other, [item(started())]);

        expect(await hasRuns(test.db, projectId)).toBe(false);
    });
});

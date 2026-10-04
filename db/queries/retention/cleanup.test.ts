import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { hexId, NOW, oldRun } from "../../test/retention.ts";
import { createProject } from "../projects.ts";
import { cleanExpired, cleanProject, noneDeleted } from "./cleanup.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("cleanExpired", () => {
    it("keeps each project's runs for its own days and never deletes memory labels", async () => {
        const acme = await createProject(test.db, "Acme");
        const brief = await createProject(test.db, "Brief");
        await test.db.updateTable("projects").set({ retention_days: 7 }).where("id", "=", brief).execute();
        const acmeRun = await oldRun(test.db, acme, 10);
        await oldRun(test.db, brief, 10);
        await oldRun(test.db, acme, 31);
        await test.db
            .insertInto("memory_labels")
            .values({
                project_id: acme,
                print: "f".repeat(64),
                store: "notes",
                run_id: hexId(32),
                agent: "planner",
                label: "{}",
                first_written_at: new Date("2024-01-01"),
            })
            .execute();

        const result = await cleanExpired(test.db, { now: NOW });

        expect(result).toEqual({ projects: 2, deleted: { ...noneDeleted(), runs: 2 } });
        const runs = await test.db.selectFrom("runs").select("run_id").execute();
        expect(runs.map((row) => row.run_id)).toEqual([acmeRun]);
        expect(await test.db.selectFrom("memory_labels").select("print").execute()).toHaveLength(1);
    });

    it("works with the current time and nothing to delete", async () => {
        expect((await cleanExpired(test.db)).deleted).toEqual(noneDeleted());
    });
});

describe("cleanProject", () => {
    it("deletes nothing once stopped", async () => {
        const id = await createProject(test.db, "Acme");
        await oldRun(test.db, id, 90);

        expect(await cleanProject(test.db, { id, retentionDays: 30 }, { now: NOW, stopped: () => true })).toEqual(
            noneDeleted(),
        );
    });
});

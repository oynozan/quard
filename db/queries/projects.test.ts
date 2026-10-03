import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { createProject, findProject, firstProject, projectSettings } from "./projects.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("projects", () => {
    it("has no first project in an empty install", async () => {
        expect(await firstProject(test.db)).toBeUndefined();
    });

    it("finds a project by id, and the oldest one first", async () => {
        const first = await createProject(test.db, "Acme");
        await createProject(test.db, "Later");

        expect(await findProject(test.db, first)).toEqual({ id: first, name: "Acme" });
        expect(await findProject(test.db, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
        expect(await firstProject(test.db)).toEqual({ id: first, name: "Acme" });
    });
});

describe("projectSettings", () => {
    it("reads a new project's settings, with 30 days of retention", async () => {
        const id = await createProject(test.db, "Acme");

        const settings = await projectSettings(test.db, id);

        expect(settings).toMatchObject({ id, name: "Acme", retentionDays: 30 });
        expect(settings?.createdAt).toBeInstanceOf(Date);
    });

    it("reads an edited retention for that project only", async () => {
        const id = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        await test.db
            .updateTable("projects")
            .set({ retention_days: 7, created_at: "2026-10-03T23:30:00.000Z" })
            .where("id", "=", id)
            .execute();

        expect(await projectSettings(test.db, id)).toEqual({
            id,
            name: "Acme",
            retentionDays: 7,
            createdAt: new Date("2026-10-03T23:30:00.000Z"),
        });
        expect(await projectSettings(test.db, other)).toMatchObject({ name: "Other", retentionDays: 30 });
    });

    it("finds nothing for an unknown project", async () => {
        expect(await projectSettings(test.db, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
    });
});

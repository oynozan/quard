import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { createProject, findProject, firstProject } from "./projects.ts";

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

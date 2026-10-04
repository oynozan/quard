import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connect, type Db } from "../connect/connect.ts";
import type { Database } from "../schema/database.ts";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { createProject, findOrCreateFirstProject, findProject, firstProject, projectSettings } from "./projects.ts";

let test: TestDb;
// A pool with several connections, for calls that race
let many: Db;

beforeAll(async () => {
    test = await startTestDb();
    many = connect(test.url, 4);
}, 60_000);

afterAll(async () => {
    await many.destroy();
    await test.stop();
});

describe("projects", () => {
    it("has no first project in an empty install", async () => {
        expect(await firstProject(test.db)).toBeUndefined();
    });

    it("finds a project by id, and the oldest one first", async () => {
        const first = await createProject(test.db, "Acme");
        const later = await createProject(test.db, "Later");
        // Two quick inserts can share a timestamp, and then the random id decides
        await test.db
            .updateTable("projects")
            .set({ created_at: sql`created_at + interval '1 second'` })
            .where("id", "=", later)
            .execute();

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

describe("findOrCreateFirstProject", () => {
    // Each test starts from a new install
    beforeEach(async () => {
        await test.db.deleteFrom("projects").execute();
    });

    it("makes a project on a new install, and finds it from then on", async () => {
        const id = await findOrCreateFirstProject(test.db, "Default");

        expect(await findProject(test.db, id)).toEqual({ id, name: "Default" });
        expect(await findOrCreateFirstProject(test.db, "Other")).toBe(id);
        expect(await test.db.selectFrom("projects").select("id").execute()).toEqual([{ id }]);
    });

    it("makes one project when two calls overlap", async () => {
        // Two open connections, so both reads go out at once
        const read = () => many.selectFrom("projects").select("id").execute();
        await Promise.all([read(), read()]);

        const ids = await Promise.all([
            findOrCreateFirstProject(many, "Default"),
            findOrCreateFirstProject(many, "Default"),
        ]);

        expect(ids[1]).toBe(ids[0]);
        expect(await test.db.selectFrom("projects").select("id").execute()).toEqual([{ id: ids[0] }]);
    });

    it("takes its lock inside the transaction, before it reads", async () => {
        // On a real server the lock is what makes the second call wait
        const statements: string[] = [];
        const logged = new Kysely<Database>({
            dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: test.url, max: 1 }) }),
            log: (event) => void statements.push(event.query.sql),
        });

        await findOrCreateFirstProject(logged, "Default");
        await logged.destroy();

        expect(statements).toEqual([
            "begin",
            "SELECT pg_advisory_xact_lock($1)",
            'select "id", "name" from "projects" order by "created_at", "id" limit $1',
            'insert into "projects" ("name") values ($1) returning "id"',
            "commit",
        ]);
    });
});

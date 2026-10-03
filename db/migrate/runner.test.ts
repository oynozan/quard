import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listMigrations, runMigrations, type Query } from "./runner.ts";

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "quard-migrations-"));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

// A fake database that records every statement
function fakeDb(applied: string[] = [], failOn?: string) {
    const statements: string[] = [];
    const query: Query = async (sql, params) => {
        statements.push(params ? `${sql} ${JSON.stringify(params)}` : sql);
        if (sql === failOn) {
            throw new Error("boom");
        }
        if (sql === "SELECT name FROM schema_migrations") {
            return { rows: applied.map((name) => ({ name })) };
        }
        return { rows: [] };
    };
    return { query, statements };
}

describe("listMigrations", () => {
    it("returns .sql files in name order", async () => {
        await writeFile(join(dir, "0002_b.sql"), "");
        await writeFile(join(dir, "0001_a.sql"), "");
        await writeFile(join(dir, "notes.txt"), "");

        expect(await listMigrations(dir)).toEqual(["0001_a.sql", "0002_b.sql"]);
    });
});

describe("runMigrations", () => {
    it("applies new migrations in order, each in a transaction", async () => {
        await writeFile(join(dir, "0001_a.sql"), "CREATE TABLE a ();");
        await writeFile(join(dir, "0002_b.sql"), "CREATE TABLE b ();");
        const db = fakeDb();

        const applied = await runMigrations(db.query, dir);

        expect(applied).toEqual(["0001_a.sql", "0002_b.sql"]);
        expect(db.statements).toEqual([
            "SELECT pg_advisory_lock($1) [7231]",
            expect.stringContaining("CREATE TABLE IF NOT EXISTS schema_migrations"),
            "SELECT name FROM schema_migrations",
            "BEGIN",
            "CREATE TABLE a ();",
            'INSERT INTO schema_migrations (name) VALUES ($1) ["0001_a.sql"]',
            "COMMIT",
            "BEGIN",
            "CREATE TABLE b ();",
            'INSERT INTO schema_migrations (name) VALUES ($1) ["0002_b.sql"]',
            "COMMIT",
            "SELECT pg_advisory_unlock($1) [7231]",
        ]);
    });

    it("skips migrations that already ran", async () => {
        await writeFile(join(dir, "0001_a.sql"), "CREATE TABLE a ();");
        const db = fakeDb(["0001_a.sql"]);

        expect(await runMigrations(db.query, dir)).toEqual([]);
        expect(db.statements).not.toContain("CREATE TABLE a ();");
    });

    it("rolls back a failing migration and still releases the lock", async () => {
        await writeFile(join(dir, "0001_bad.sql"), "BROKEN SQL");
        const db = fakeDb([], "BROKEN SQL");

        await expect(runMigrations(db.query, dir)).rejects.toThrow("boom");
        expect(db.statements.slice(-3)).toEqual(["BROKEN SQL", "ROLLBACK", "SELECT pg_advisory_unlock($1) [7231]"]);
    });
});

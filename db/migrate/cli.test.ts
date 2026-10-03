import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    runMigrations: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
    query: vi.fn(async () => ({ rows: [] })),
    options: [] as unknown[],
}));

vi.mock("./runner.ts", () => ({ runMigrations: mocks.runMigrations }));
vi.mock("pg", () => ({
    default: {
        Client: class {
            constructor(options: unknown) {
                mocks.options.push(options);
            }
            connect = mocks.connect;
            end = mocks.end;
            query = mocks.query;
        },
    },
}));

const { MIGRATIONS_DIR, migrateFromEnv } = await import("./cli.ts");

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mocks.options.length = 0;
});

describe("migrateFromEnv", () => {
    it("fails when DATABASE_URL is missing", async () => {
        const log = vi.fn();

        expect(await migrateFromEnv({}, log)).toBe(1);
        expect(log).toHaveBeenCalledWith("DATABASE_URL is not set");
        expect(mocks.connect).not.toHaveBeenCalled();
    });

    it("runs migrations and reports what was applied", async () => {
        mocks.runMigrations.mockImplementation(async (query: (sql: string) => Promise<unknown>) => {
            await query("SELECT 1");
            return ["0001_a.sql", "0002_b.sql"];
        });
        const log = vi.fn();

        expect(await migrateFromEnv({ DATABASE_URL: "postgres://db" }, log)).toBe(0);
        expect(mocks.options).toEqual([{ connectionString: "postgres://db" }]);
        expect(mocks.query).toHaveBeenCalledWith("SELECT 1", undefined);
        expect(mocks.runMigrations).toHaveBeenCalledWith(expect.any(Function), MIGRATIONS_DIR);
        expect(log).toHaveBeenCalledWith("Applied: 0001_a.sql, 0002_b.sql");
        expect(mocks.end).toHaveBeenCalled();
    });

    it("says so when there is nothing new", async () => {
        mocks.runMigrations.mockResolvedValue([]);
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        expect(await migrateFromEnv({ DATABASE_URL: "postgres://db" })).toBe(0);
        expect(log).toHaveBeenCalledWith("No new migrations");
    });

    it("closes the connection when a migration fails", async () => {
        mocks.runMigrations.mockRejectedValue(new Error("boom"));

        await expect(migrateFromEnv({ DATABASE_URL: "postgres://db" }, vi.fn())).rejects.toThrow("boom");
        expect(mocks.end).toHaveBeenCalled();
    });

    it("points at the db/migrations folder", () => {
        expect(MIGRATIONS_DIR.replaceAll("\\", "/")).toMatch(/\/db\/migrations$/);
    });
});

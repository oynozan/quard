// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const migrateDatabase = vi.fn();
vi.mock("@quard/db/migrate", () => ({ migrateDatabase: (url: string) => migrateDatabase(url) }));

const { migrateOnStart } = await import("./migrate-on-start");

describe("migrateOnStart", () => {
    beforeEach(() => {
        migrateDatabase.mockReset();
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    it("applies new migrations and says which", async () => {
        migrateDatabase.mockResolvedValue(["0005_approvals.sql"]);
        await migrateOnStart({ DATABASE_URL: "postgres://db" });
        expect(migrateDatabase).toHaveBeenCalledWith("postgres://db");
        expect(console.log).toHaveBeenCalledWith("[db] Applied migrations: 0005_approvals.sql");
    });

    it("stays quiet when nothing is new", async () => {
        migrateDatabase.mockResolvedValue([]);
        await migrateOnStart({ DATABASE_URL: "postgres://db" });
        expect(console.log).not.toHaveBeenCalled();
    });

    it("logs a failure instead of stopping the server", async () => {
        migrateDatabase.mockRejectedValue(new Error("connection refused"));
        await expect(migrateOnStart({ DATABASE_URL: "postgres://db" })).resolves.toBeUndefined();
        expect(console.error).toHaveBeenCalledWith("[db] Migrations could not run:", "connection refused");
        migrateDatabase.mockRejectedValue("odd");
        await migrateOnStart({ DATABASE_URL: "postgres://db" });
        expect(console.error).toHaveBeenCalledWith("[db] Migrations could not run:", "odd");
    });

    it("does nothing without a database, and reads the process environment by default", async () => {
        await migrateOnStart({});
        expect(migrateDatabase).not.toHaveBeenCalled();
        await expect(migrateOnStart()).resolves.toBeUndefined();
    });
});

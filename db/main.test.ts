import { afterEach, describe, expect, it, vi } from "vitest";

const migrateFromEnv = vi.hoisted(() => vi.fn(async () => 0));

vi.mock("./migrate/cli.ts", () => ({ migrateFromEnv }));

afterEach(() => {
    process.exitCode = undefined;
});

describe("db main", () => {
    it("sets the exit code from the migration result", async () => {
        migrateFromEnv.mockResolvedValueOnce(1);

        await import("./main.ts");

        expect(migrateFromEnv).toHaveBeenCalledWith(process.env);
        expect(process.exitCode).toBe(1);
    });
});

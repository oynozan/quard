// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const connect = vi.hoisted(() => vi.fn((url: string) => ({ url })));
vi.mock("@quard/db", () => ({ connect }));

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    connect.mockClear();
});

describe("database", () => {
    it("opens one pool per process from DATABASE_URL", async () => {
        vi.stubEnv("DATABASE_URL", "postgres://db");
        const { database } = await import("./client");

        expect(database()).toEqual({ url: "postgres://db" });
        expect(database()).toBe(database());
        expect(connect).toHaveBeenCalledTimes(1);
    });

    it("says so when DATABASE_URL is missing", async () => {
        vi.stubEnv("DATABASE_URL", "");
        const { database } = await import("./client");

        expect(() => database()).toThrow("DATABASE_URL is not set");
    });

    it("has its DATABASE_URL listed in web/.env.example, which a new setup copies", () => {
        const example = readFileSync(new URL("../../../../../.env.example", import.meta.url), "utf8");

        expect(example).toMatch(/^DATABASE_URL=$/m);
    });
});

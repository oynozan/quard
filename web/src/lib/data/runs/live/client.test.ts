// @vitest-environment node
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
});

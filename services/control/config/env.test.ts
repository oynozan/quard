import { describe, expect, it } from "vitest";
import { readConfig } from "./env.ts";

const KEY = "ab".repeat(32);

describe("readConfig", () => {
    it("reads the database, the hash key and the port", () => {
        const config = readConfig({ DATABASE_URL: "postgres://db", QUARD_HASH_KEY: KEY, PORT: "5200" });

        expect(config).toMatchObject({ port: 5200, databaseUrl: "postgres://db" });
        expect(typeof config === "string" ? "" : config.redactor.text("jane@acme.com")).toBe("j…@acme.com");
    });

    it("falls back to port 4200", () => {
        expect(readConfig({ DATABASE_URL: "postgres://db", QUARD_HASH_KEY: KEY })).toMatchObject({ port: 4200 });
    });

    it.each([
        ["no database", { QUARD_HASH_KEY: KEY }, "DATABASE_URL is not set"],
        ["no hash key", { DATABASE_URL: "postgres://db" }, "QUARD_HASH_KEY is not set"],
        ["a bad hash key", { DATABASE_URL: "postgres://db", QUARD_HASH_KEY: "short" }, "QUARD_HASH_KEY is not valid"],
    ])("says what is wrong with %s", (_, env, message) => {
        expect(readConfig(env)).toEqual(expect.stringContaining(message));
    });
});

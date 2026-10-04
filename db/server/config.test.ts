import { parseHashKey, projectHashKey } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { readServerConfig } from "./config.ts";

const KEY = "ab".repeat(32);

describe("readServerConfig", () => {
    it("reads the database, the install's hash key and the port", () => {
        const config = readServerConfig({ DATABASE_URL: "postgres://db", QUARD_HASH_KEY: KEY, PORT: "5200" }, 4200);
        if (typeof config === "string") {
            throw new Error(config);
        }

        expect(config).toMatchObject({ port: 5200, databaseUrl: "postgres://db" });
        expect(config.installKey.equals(parseHashKey(KEY))).toBe(true);
        expect(config.keys.hashKey("project-1")).toBe(projectHashKey(parseHashKey(KEY), "project-1").toString("hex"));
        expect(config.keys.redactor("project-1").text("jane@acme.com")).toBe("j…@acme.com");
    });

    it("falls back to the default port", () => {
        const env = { DATABASE_URL: "postgres://db", QUARD_HASH_KEY: KEY };

        expect(readServerConfig(env, 4100)).toMatchObject({ port: 4100 });
        expect(readServerConfig({ ...env, PORT: "" }, 4200)).toMatchObject({ port: 4200 });
    });

    it.each([
        ["no database", { QUARD_HASH_KEY: KEY }, "DATABASE_URL is not set"],
        [
            "no hash key",
            { DATABASE_URL: "postgres://db" },
            "QUARD_HASH_KEY is not set: 64 hex characters, the same for webhook, control and the dashboard. " +
                "Agents never need it.",
        ],
        ["a bad hash key", { DATABASE_URL: "postgres://db", QUARD_HASH_KEY: "short" }, "QUARD_HASH_KEY is not valid: "],
    ])("says what is wrong with %s", (_, env, message) => {
        expect(readServerConfig(env, 4200)).toEqual(expect.stringContaining(message));
    });
});

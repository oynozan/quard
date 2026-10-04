import { describe, expect, it } from "vitest";
import { readConfig } from "./env.ts";

describe("readConfig", () => {
    it("reads the database and the OpenAI key, with the default base URL", () => {
        expect(readConfig({ DATABASE_URL: "postgres://db", OPENAI_API_KEY: "sk-test" })).toEqual({
            databaseUrl: "postgres://db",
            openai: { apiKey: "sk-test", baseUrl: "https://api.openai.com/v1" },
        });
    });

    it("takes another base URL without its trailing slash", () => {
        const config = readConfig({
            DATABASE_URL: "postgres://db",
            OPENAI_API_KEY: "sk-test",
            OPENAI_BASE_URL: "http://localhost:9000/v1/",
        });

        expect(config).toMatchObject({ openai: { baseUrl: "http://localhost:9000/v1" } });
    });

    it("runs without an OpenAI key", () => {
        expect(readConfig({ DATABASE_URL: "postgres://db", OPENAI_API_KEY: "" })).toEqual({
            databaseUrl: "postgres://db",
            openai: undefined,
        });
    });

    it("says when the database is not set", () => {
        expect(readConfig({ OPENAI_API_KEY: "sk-test" })).toBe("DATABASE_URL is not set");
    });
});

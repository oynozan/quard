import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { projectForKey } from "../queries/keys.ts";
import { findProject } from "../queries/projects.ts";
import { startTestDb, type TestDb } from "../test/pglite.ts";
import { readFlags, setupFromArgs } from "./setup.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("readFlags", () => {
    it("reads --name value pairs and skips loose words and a bare --", () => {
        expect(readFlags(["--", "loose", "--project", "Acme", "--dangling"])).toEqual({ project: "Acme" });
    });
});

describe("setupFromArgs", () => {
    it("needs a database", async () => {
        const log = vi.fn();

        expect(await setupFromArgs([], {}, log)).toBe(1);
        expect(log).toHaveBeenCalledWith("DATABASE_URL is not set");
    });

    it("creates a project and a working agent key, and suggests a hash key", async () => {
        const lines: string[] = [];

        expect(await setupFromArgs(["--project", "Acme"], { DATABASE_URL: test.url }, (line) => lines.push(line))).toBe(
            0,
        );

        const key = String(
            lines
                .find((line) => line.startsWith("Agent key:"))
                ?.split(" ")
                .pop(),
        );
        const projectId = await projectForKey(test.db, key);
        expect(await findProject(test.db, String(projectId))).toMatchObject({ name: "Acme" });
        const hint = lines.find((line) => /QUARD_HASH_KEY=[0-9a-f]{64}$/.test(line));
        expect(hint).toMatch(/^Set this for webhook, control and the dashboard \(agents never need it\): /);
    });

    it("names the project Default and skips the hash key hint when one is set", async () => {
        const lines: string[] = [];
        const env = { DATABASE_URL: test.url, QUARD_HASH_KEY: "x" };

        expect(await setupFromArgs([], env, (line) => lines.push(line))).toBe(0);
        expect(lines.some((line) => line.includes("QUARD_HASH_KEY"))).toBe(false);
        const projectId = lines
            .find((line) => line.startsWith("Project:"))
            ?.split(" ")
            .pop();
        expect(await findProject(test.db, String(projectId))).toMatchObject({ name: "Default" });
    });

    it("logs to the console by default", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        await setupFromArgs([], {});

        expect(log).toHaveBeenCalledWith("DATABASE_URL is not set");
        log.mockRestore();
    });
});

import { createProject, ingestBatch } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chunkLabel, item, started } from "../../../db/test/events.ts";
import { runNextJob } from "./jobs.ts";

vi.mock("../jobs/fallback.ts", () => ({
    runFallback: async () => {
        throw new Error("the database went away");
    },
}));

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("runNextJob with a fallback job that throws", () => {
    it("reports it as failed, to be claimed again when its lease runs out", async () => {
        const projectId = await createProject(test.db, "Acme");
        const chunk = item(chunkLabel({ label: "none", probabilities: { none: 0.7 }, score: 0 }));
        await ingestBatch(test.db, projectId, [item(started()), chunk]);

        expect(await runNextJob({ db: test.db, openai: undefined })).toBe(
            `fallback ${chunk.id}: failed: the database went away`,
        );
    });
});

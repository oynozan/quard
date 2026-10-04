import { createProject, ingestBatch, requestReplay } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chunkLabel, item, started } from "../../../db/test/events.ts";
import { storeAttack } from "../test/db.ts";
import { OPENAI, payingModel } from "../test/model.ts";
import { runNextJob } from "./jobs.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

beforeEach(async () => {
    await test.db.deleteFrom("incidents").execute();
    await test.db.deleteFrom("chunk_labels").execute();
});

// A chunk labeled none, waiting for the AI fallback
async function storeNone(): Promise<string> {
    const projectId = await createProject(test.db, "Acme");
    const chunk = item(chunkLabel({ label: "none", probabilities: { none: 0.7 }, score: 0 }));
    await ingestBatch(test.db, projectId, [item(started()), chunk]);
    return chunk.id;
}

describe("runNextJob", () => {
    it("finds nothing to do when no job is due", async () => {
        expect(await runNextJob({ db: test.db, openai: undefined })).toBeUndefined();
    });

    it("finds the verdict, writes the note, then replays once asked", async () => {
        const model = payingModel();
        const deps = { db: test.db, openai: OPENAI, fetch: model.fetch };
        const { projectId, id } = await storeAttack(test.db);

        expect(await runNextJob({ db: test.db, openai: undefined })).toBe(`find ${id}: verdict: bad input`);
        expect(await runNextJob(deps)).toBe(`review ${id}: note written`);
        expect(await runNextJob(deps)).toBeUndefined();

        await requestReplay(test.db, projectId, id, { by: "ana@acme.com" });
        expect(await runNextJob(deps)).toBe(`replay ${id}: confirmed`);
    });

    it("reports a job that threw as failed", async () => {
        const { id } = await storeAttack(test.db);
        await test.db
            .updateTable("incidents")
            .set({ find_state: "done", review_state: "skipped", replay_state: "requested", verdict: "{}" })
            .where("id", "=", id)
            .execute();

        expect(await runNextJob({ db: test.db, openai: undefined })).toMatch(new RegExp(`^replay ${id}: failed: `));
    });

    it("labels chunks the detector called none once no incident job is due", async () => {
        const eventId = await storeNone();
        const { id } = await storeAttack(test.db);

        expect(await runNextJob({ db: test.db, openai: undefined })).toBe(`find ${id}: verdict: bad input`);
        expect(await runNextJob({ db: test.db, openai: undefined })).toBe(
            `review ${id}: skipped: OPENAI_API_KEY is not set`,
        );
        expect(await runNextJob({ db: test.db, openai: undefined })).toBe(
            `fallback ${eventId}: skipped: OPENAI_API_KEY is not set`,
        );
        expect(await runNextJob({ db: test.db, openai: undefined })).toBeUndefined();
    });
});

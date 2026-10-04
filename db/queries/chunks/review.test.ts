import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chunkLabel, item, started } from "../../test/events.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { labelStats, reviewChunk } from "./review.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const reviewer = async (projectId: string, eventId: string) =>
    test.db
        .selectFrom("chunk_labels")
        .select(["reviewed_label", "reviewed_by"])
        .where("project_id", "=", projectId)
        .where("event_id", "=", eventId)
        .executeTakeFirstOrThrow();

describe("reviewChunk", () => {
    it("saves the right label and who chose it, and a later review replaces it", async () => {
        const projectId = await createProject(test.db, "Acme");
        const chunk = item(chunkLabel());
        await ingestBatch(test.db, projectId, [item(started()), chunk]);

        expect(await reviewChunk(test.db, projectId, chunk.id, "invoice", "@dana-k")).toBe(true);
        expect(await reviewer(projectId, chunk.id)).toEqual({ reviewed_label: "invoice", reviewed_by: "@dana-k" });

        await reviewChunk(test.db, projectId, chunk.id, "payment_fraud", "sam@acme.com");
        expect(await reviewer(projectId, chunk.id)).toEqual({
            reviewed_label: "payment_fraud",
            reviewed_by: "sam@acme.com",
        });
    });

    it("finds nothing in another project", async () => {
        const projectId = await createProject(test.db, "Acme");
        const other = await createProject(test.db, "Other");
        const chunk = item(chunkLabel());
        await ingestBatch(test.db, projectId, [item(started()), chunk]);

        expect(await reviewChunk(test.db, other, chunk.id, "invoice", "@dana-k")).toBe(false);
    });
});

describe("labelStats", () => {
    it("counts chunks waiting, reviewed and kept per label, and how often a flag was right", async () => {
        const projectId = await createProject(test.db, "Acme");
        const fraud = (score: number) => item(chunkLabel({ score }));
        const [kept, wrong, quiet, open] = [fraud(0.9), fraud(0.6), fraud(0.3), fraud(0.8)];
        const article = item(chunkLabel({ label: "article", probabilities: { article: 0.9 }, score: 0 }));
        await ingestBatch(test.db, projectId, [item(started()), kept, wrong, quiet, open, article]);
        await reviewChunk(test.db, projectId, kept.id, "payment_fraud", "@dana-k");
        await reviewChunk(test.db, projectId, wrong.id, "invoice", "@dana-k");
        await reviewChunk(test.db, projectId, quiet.id, "payment_fraud", "@dana-k");

        expect(await labelStats(test.db, projectId)).toEqual([
            { label: "article", open: 1, reviewed: 0, right: 0, flagged: 0, flaggedRight: 0 },
            { label: "payment_fraud", open: 1, reviewed: 3, right: 2, flagged: 2, flaggedRight: 1 },
        ]);
        expect(await labelStats(test.db, await createProject(test.db, "Empty"))).toEqual([]);
    });
});

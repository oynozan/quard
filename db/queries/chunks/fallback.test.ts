import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chunkLabel, item, started } from "../../test/events.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { ingestBatch } from "../ingest/store.ts";
import { createProject } from "../projects.ts";
import { claimFallbackJob, MAX_FALLBACK_ATTEMPTS, saveFallback } from "./fallback.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const none = (at: string) =>
    item(chunkLabel({ label: "none", probabilities: { none: 0.8 }, score: 0, at, text: `Chunk at ${at}` }));

const stored = (projectId: string, eventId: string) =>
    test.db
        .selectFrom("chunk_labels")
        .select([
            "fallback_state",
            "fallback_label",
            "fallback_reason",
            "fallback_model",
            "fallback_cost_usd",
            "fallback_error",
            "leased_until",
        ])
        .where("project_id", "=", projectId)
        .where("event_id", "=", eventId)
        .executeTakeFirstOrThrow();

// Clears every pending chunk, so each test starts with an empty queue
async function drain(): Promise<void> {
    await test.db.updateTable("chunk_labels").set({ fallback_state: "skipped" }).execute();
}

describe("claimFallbackJob", () => {
    it("leases the oldest chunk labeled none, once, and skips other labels", async () => {
        await drain();
        const projectId = await createProject(test.db, "Acme");
        const newer = none("2026-10-03T12:00:03.000Z");
        const older = none("2026-10-03T12:00:02.000Z");
        await ingestBatch(test.db, projectId, [item(started()), item(chunkLabel()), newer, older]);

        expect(await claimFallbackJob(test.db, 60_000)).toEqual({
            projectId,
            eventId: older.id,
            text: "Chunk at 2026-10-03T12:00:02.000Z",
            attempts: 1,
        });
        expect((await claimFallbackJob(test.db, 60_000))?.eventId).toBe(newer.id);
        expect(await claimFallbackJob(test.db, 60_000)).toBeUndefined();
    });

    it("claims a chunk again once its lease ran out, but gives up after the last try", async () => {
        await drain();
        const projectId = await createProject(test.db, "Acme");
        const chunk = none("2026-10-03T12:00:02.000Z");
        await ingestBatch(test.db, projectId, [item(started()), chunk]);

        for (let attempt = 1; attempt <= MAX_FALLBACK_ATTEMPTS; attempt += 1) {
            expect((await claimFallbackJob(test.db, -1))?.attempts).toBe(attempt);
        }
        expect(await claimFallbackJob(test.db, -1)).toBeUndefined();
    });
});

describe("saveFallback", () => {
    it("stores the label, an error, or that the job was skipped, and frees the lease", async () => {
        await drain();
        const projectId = await createProject(test.db, "Acme");
        const chunk = none("2026-10-03T12:00:02.000Z");
        await ingestBatch(test.db, projectId, [item(started()), chunk]);
        await claimFallbackJob(test.db, 60_000);

        await saveFallback(test.db, projectId, chunk.id, { error: "The model call failed with status 500" });
        expect(await stored(projectId, chunk.id)).toMatchObject({
            fallback_state: "failed",
            fallback_error: "The model call failed with status 500",
            leased_until: null,
        });

        const label = { label: "tax_notice", reason: "A tax office letter.", model: "gpt-6.1-sol", costUsd: 0.001 };
        await saveFallback(test.db, projectId, chunk.id, label);
        expect(await stored(projectId, chunk.id)).toEqual({
            fallback_state: "done",
            fallback_label: "tax_notice",
            fallback_reason: "A tax office letter.",
            fallback_model: "gpt-6.1-sol",
            fallback_cost_usd: 0.001,
            fallback_error: null,
            leased_until: null,
        });

        await saveFallback(test.db, projectId, chunk.id, null);
        expect(await stored(projectId, chunk.id)).toMatchObject({ fallback_state: "skipped" });
    });
});

// @vitest-environment node
import { createProject, ingestBatch, reviewChunk, saveFallback, type ChunkItem } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chunkLabel, item, started } from "../../../../../db/test/events";

vi.mock("@/lib/auth/session", () => ({ requireSession: async () => ({ sub: "did:privy:1" }) }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const { getContentLabels, reviewChunkOf, statRows } = await import("./query");
const { database } = await import("../runs/live/client");

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
    vi.stubEnv("DATABASE_URL", test.url);
}, 60_000);

afterAll(async () => {
    await database().destroy();
    vi.unstubAllEnvs();
    await test.stop();
});

const AT = new Date("2026-10-03T12:00:00.000Z");

const chunk = (overrides: Partial<ChunkItem> = {}): ChunkItem => ({
    eventId: "a".repeat(16),
    runId: "1".repeat(32),
    stepId: "2".repeat(16),
    agent: "billing",
    tool: "fetchPage",
    origin: "web:acme-billing.net",
    detector: "jev-1.13.0",
    chunk: 0,
    text: "Pay DE89…3000 today.",
    label: "payment_fraud",
    probabilities: { invoice: 0.2, payment_fraud: 0.5, phishing: 0.25, article: 0.05 },
    confidence: 0.5,
    score: 0.75,
    injection: null,
    at: AT,
    fallback: null,
    review: null,
    ...overrides,
});

describe("reviewChunkOf", () => {
    it("keeps the three likeliest labels, most likely first, and times as numbers", () => {
        expect(reviewChunkOf(chunk())).toEqual({
            eventId: "a".repeat(16),
            runId: "1".repeat(32),
            agent: "billing",
            tool: "fetchPage",
            origin: "web:acme-billing.net",
            text: "Pay DE89…3000 today.",
            label: "payment_fraud",
            chances: [
                { label: "payment_fraud", chance: 0.5 },
                { label: "phishing", chance: 0.25 },
                { label: "invoice", chance: 0.2 },
            ],
            confidence: 0.5,
            at: AT.getTime(),
            fallback: null,
            review: null,
        });
    });

    it("keeps the fallback's label and the review", () => {
        const fallback = { state: "done" as const, label: "tax_notice", reason: "A tax letter.", error: null };
        const review = { label: "tax_notice", by: "@dana-k", at: AT };

        expect(reviewChunkOf(chunk({ fallback, review }))).toMatchObject({
            fallback: { state: "done", label: "tax_notice", reason: "A tax letter." },
            review: { label: "tax_notice", by: "@dana-k", at: AT.getTime() },
        });
    });
});

describe("statRows", () => {
    it("gives every fixed label a row, then labels outside the list", () => {
        const stat = { label: "payment_fraud", open: 1, reviewed: 4, right: 3, flagged: 2, flaggedRight: 2 };
        const extra = { ...stat, label: "tax_notice" };

        const rows = statRows([stat, extra]);

        expect(rows[0]).toEqual({
            label: "prompt_injection",
            risky: true,
            open: 0,
            reviewed: 0,
            right: 0,
            flagged: 0,
            flaggedRight: 0,
        });
        expect(rows[1]).toEqual({ ...stat, risky: true });
        expect(rows.at(-2)?.label).toBe("none");
        expect(rows.at(-1)).toEqual({ ...extra, risky: false });
    });
});

describe("getContentLabels", () => {
    it("keeps the label table drawn before a project exists", async () => {
        const data = await getContentLabels();

        expect(data).toMatchObject({ open: 0, queue: [], reviewed: [] });
        expect(data.stats).toHaveLength(13);
    });

    it("reads the queue, the reviews and the counts per label", async () => {
        const projectId = await createProject(test.db, "Acme");
        const unsure = item(chunkLabel({ label: "none", probabilities: { none: 0.4 }, score: 0 }));
        const done = item(chunkLabel());
        await ingestBatch(test.db, projectId, [item(started()), unsure, done]);
        await reviewChunk(test.db, projectId, done.id, "invoice", "@dana-k");
        await saveFallback(test.db, projectId, unsure.id, {
            label: "tax_notice",
            reason: "Tax.",
            model: "m",
            costUsd: 0,
        });

        const data = await getContentLabels();

        expect(data.open).toBe(1);
        expect(data.queue).toMatchObject([{ eventId: unsure.id, fallback: { label: "tax_notice" } }]);
        expect(data.reviewed).toMatchObject([{ eventId: done.id, review: { label: "invoice", by: "@dana-k" } }]);
        expect(data.stats.find((row) => row.label === "payment_fraud")).toMatchObject({ reviewed: 1, right: 0 });
    });
});

import { chunkQueue, claimFallbackJob, createProject, ingestBatch, type FallbackJob } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chunkLabel, item, started } from "../../../db/test/events.ts";
import { fakeResponses } from "../../../packages/sdk/test/fake-responses.ts";
import { OPENAI, USAGE } from "../test/model.ts";
import { FALLBACK_MODEL, runFallback } from "./fallback.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

beforeEach(async () => {
    await test.db.deleteFrom("chunk_labels").execute();
});

const TEXT = "Your 2026 tax return is due. Send it to j…@acme.com.";

// A chunk labeled none in a new project, claimed for the fallback
async function noneDue(): Promise<{ projectId: string; job: FallbackJob }> {
    const projectId = await createProject(test.db, "Acme");
    const chunk = chunkLabel({ label: "none", probabilities: { none: 0.7 }, score: 0, text: TEXT });
    await ingestBatch(test.db, projectId, [item(started()), item(chunk)]);
    const job = await claimFallbackJob(test.db, 60_000);
    if (job === undefined) {
        throw new Error("no fallback job is due");
    }
    return { projectId, job };
}

const fallbackOf = async (projectId: string) => (await chunkQueue(test.db, projectId))[0]?.fallback;

// A model that answers with the given text
const answering = (text: string) => fakeResponses(() => ({ text, usage: USAGE }));

describe("runFallback", () => {
    it("is skipped without a provider key", async () => {
        const { projectId, job } = await noneDue();

        expect(await runFallback({ db: test.db, openai: undefined }, job)).toBe("skipped: OPENAI_API_KEY is not set");
        expect(await fallbackOf(projectId)).toMatchObject({ state: "skipped", label: null });
    });

    it("stores a new label with its one-line reason", async () => {
        const fake = answering(JSON.stringify({ label: "tax_notice", reason: "A letter\n about a  tax return." }));
        const { projectId, job } = await noneDue();

        expect(await runFallback({ db: test.db, openai: OPENAI, fetch: fake.fetch }, job)).toBe("labeled tax_notice");

        expect(await fallbackOf(projectId)).toEqual({
            state: "done",
            label: "tax_notice",
            reason: "A letter about a tax return.",
            error: null,
        });
        const [body] = fake.bodies;
        expect(body).toMatchObject({ model: FALLBACK_MODEL, store: false, input: TEXT });
        expect(body?.instructions).toContain("invoice: ");
        expect(body?.instructions).not.toContain("none: ");
        expect(body?.text).toMatchObject({ format: { type: "json_schema", strict: true } });
    });

    it("keeps a fixed label, and cuts a long reason", async () => {
        const fake = answering(JSON.stringify({ label: "article", reason: "x".repeat(300) }));
        const { projectId, job } = await noneDue();

        await runFallback({ db: test.db, openai: OPENAI, fetch: fake.fetch }, job);

        expect(await fallbackOf(projectId)).toMatchObject({ label: "article", reason: "x".repeat(200) });
    });

    it.each([
        ["text that is not JSON", "tax_notice", "The fallback did not answer in JSON"],
        ["JSON null", "null", "The fallback gave no usable label"],
        ["a label that is not a plain name", JSON.stringify({ label: "Tax Notice", reason: "" }), "no usable label"],
        ["none again", JSON.stringify({ label: "none", reason: "Nothing fits." }), "no usable label"],
        ["no reason", JSON.stringify({ label: "tax_notice" }), undefined],
    ])("handles %s", async (_what, text, error) => {
        const fake = answering(text);
        const { projectId, job } = await noneDue();

        const line = await runFallback({ db: test.db, openai: OPENAI, fetch: fake.fetch }, job);

        if (error === undefined) {
            expect(line).toBe("labeled tax_notice");
            expect(await fallbackOf(projectId)).toMatchObject({ state: "done", reason: "" });
        } else {
            expect(line).toContain("failed: ");
            expect((await fallbackOf(projectId))?.error).toContain(error);
        }
    });

    it("stores the error when the model call fails", async () => {
        const { projectId, job } = await noneDue();
        const fetch = async () => new Response("", { status: 500 });

        expect(await runFallback({ db: test.db, openai: OPENAI, fetch }, job)).toBe(
            "failed: The model call failed with status 500",
        );
        expect(await fallbackOf(projectId)).toMatchObject({ state: "failed" });
    });
});

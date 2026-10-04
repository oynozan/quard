import { getIncident } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeResponses } from "../../../packages/sdk/test/fake-responses.ts";
import { claim, storeAttack } from "../test/db.ts";
import { OPENAI, USAGE } from "../test/model.ts";
import type { Fetch } from "../openai/call.ts";
import { runFind } from "./find.ts";
import { REVIEW_MODEL, runReview } from "./review.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

beforeEach(async () => {
    await test.db.deleteFrom("incidents").execute();
});

// The M1 attack with its verdict found, and its review job claimed
async function reviewDue() {
    const stored = await storeAttack(test.db);
    await runFind({ db: test.db, openai: undefined }, await claim(test.db));
    return { ...stored, job: await claim(test.db) };
}

describe("runReview", () => {
    it("is skipped without a provider key", async () => {
        const { projectId, id, job } = await reviewDue();

        expect(await runReview({ db: test.db, openai: undefined }, job)).toBe("skipped: OPENAI_API_KEY is not set");
        expect(await getIncident(test.db, projectId, id)).toMatchObject({ reviewState: "skipped", reviewer: null });
    });

    it("explains the verdict in paragraphs and counts what the note cost", async () => {
        const fake = fakeResponses(() => ({
            text: "The page carried an IBAN.\n\n  The guard blocked it.\n",
            usage: USAGE,
        }));
        const { projectId, id, job } = await reviewDue();

        expect(await runReview({ db: test.db, openai: OPENAI, fetch: fake.fetch }, job)).toBe("note written");

        expect(await getIncident(test.db, projectId, id)).toMatchObject({
            reviewState: "done",
            reviewer: {
                model: REVIEW_MODEL,
                costUsd: 0.005,
                writtenAt: expect.stringMatching(/^\d{4}-/),
                paragraphs: ["The page carried an IBAN.", "The guard blocked it."],
            },
            spentUsd: 0.005,
        });
        const [body] = fake.bodies;
        expect(body).toMatchObject({ model: REVIEW_MODEL, store: false, instructions: expect.any(String) });
        expect(body?.input).toContain("[IBAN 1]");
        expect(body?.input).not.toContain("DE89");
        expect(body?.input).toContain('"acrossAgents":null,"handoffFault":null');
        expect(body?.instructions).toContain("handoffFault");
        expect(body?.instructions).toContain("damage.kind");
    });

    it("saves the error of a failed call", async () => {
        const fetch: Fetch = async () => new Response("down", { status: 503 });
        const { projectId, id, job } = await reviewDue();

        expect(await runReview({ db: test.db, openai: OPENAI, fetch }, job)).toBe(
            "failed: The model call failed with status 503",
        );
        expect(await getIncident(test.db, projectId, id)).toMatchObject({
            reviewState: "failed",
            reviewer: { error: "The model call failed with status 503" },
            spentUsd: 0,
        });
    });

    it("counts an empty note as failed, and still counts its cost", async () => {
        const fake = fakeResponses(() => ({ text: " \n\n ", usage: USAGE }));
        const { projectId, id, job } = await reviewDue();

        await runReview({ db: test.db, openai: OPENAI, fetch: fake.fetch }, job);

        expect(await getIncident(test.db, projectId, id)).toMatchObject({
            reviewState: "failed",
            reviewer: { error: "The reviewer wrote nothing" },
            spentUsd: 0.005,
        });
    });
});

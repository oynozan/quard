import { getIncident, requestReplay, type IncidentRow, type StoredRound } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeResponses } from "../../../packages/sdk/test/fake-responses.ts";
import type { Fetch } from "../openai/call.ts";
import { NOT_RECORDED } from "../replay/request.ts";
import { REMOVED } from "../replay/without.ts";
import type { AttackOptions } from "../test/attack.ts";
import { claim, storeAttack } from "../test/db.ts";
import { CALL_USD, OPENAI, payingModel, USAGE } from "../test/model.ts";
import { runFind } from "./find.ts";
import { NO_KEY, runReplayJob } from "./replay.ts";

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

const offline = () => ({ db: test.db, openai: undefined });

// The M1 attack with its verdict found and a replay requested
async function replayDue(options: AttackOptions = {}) {
    const stored = await storeAttack(test.db, options);
    await runFind(offline(), await claim(test.db));
    await requestReplay(test.db, stored.projectId, stored.id, { by: "ana@acme.com" });
    return stored;
}

async function incident(stored: { projectId: string; id: string }): Promise<IncidentRow | undefined> {
    return getIncident(test.db, stored.projectId, stored.id);
}

const round = (withHarmful: number, withoutHarmful: number): StoredRound => ({
    with: { runs: 5, harmful: withHarmful },
    without: { runs: 5, harmful: withoutHarmful },
    pValue: 0.2,
    costUsd: 10 * CALL_USD,
    finishedAt: "2026-10-03T12:00:00.000Z",
});

describe("runReplayJob", () => {
    it("confirms that the web page made the model pay its IBAN", async () => {
        const model = payingModel();
        const stored = await replayDue();

        const line = await runReplayJob({ db: test.db, openai: OPENAI, fetch: model.fetch }, await claim(test.db));

        expect(line).toBe("confirmed");
        expect(await incident(stored)).toMatchObject({
            replayState: "done",
            spentUsd: expect.closeTo(10 * CALL_USD, 9),
            replay: {
                model: "gpt-5.4-mini",
                harmfulCall: { tool: "payInvoice", keys: [expect.stringMatching(/^iban:DE89…3000#/)] },
                removed: { contentId: "c2", origin: "web:invoices.evil-pay.com", callId: "call_1_0" },
                rounds: [{ with: { runs: 5, harmful: 5 }, without: { runs: 5, harmful: 0 } }],
                outcome: "confirmed",
                limited: null,
                error: null,
            },
        });
        expect(model.bodies).toHaveLength(10);
        expect(model.bodies.every((body) => body.store === false)).toBe(true);
        expect(model.bodies.filter((body) => JSON.stringify(body).includes(REMOVED))).toHaveLength(5);
    });

    it("rebuilds a chained turning point from the response it continued", async () => {
        const model = payingModel();
        await replayDue({ chained: true });

        expect(await runReplayJob({ db: test.db, openai: OPENAI, fetch: model.fetch }, await claim(test.db))).toBe(
            "confirmed",
        );
        expect(model.bodies[0]).not.toHaveProperty("previous_response_id");
        expect(model.bodies[0]?.input).toEqual([
            { role: "user", content: "Pay the invoice at https://invoices.evil-pay.com/inv/114" },
            expect.objectContaining({ type: "function_call", call_id: "call_1_0", name: "fetchPage" }),
            expect.objectContaining({ type: "function_call_output", call_id: "call_1_0" }),
        ]);
    });

    it("saves each round while it runs, and stops when the page changes nothing", async () => {
        const fake = fakeResponses(() => ({ text: "Done.", usage: USAGE }));
        const seen: (IncidentRow | undefined)[] = [];
        const stored = await replayDue();
        const fetch: Fetch = async (input, init) => {
            if (fake.bodies.length === 10) {
                seen.push(await incident(stored));
            }
            return fake.fetch(input, init);
        };

        expect(await runReplayJob({ db: test.db, openai: OPENAI, fetch }, await claim(test.db))).toBe(
            "could not reproduce",
        );
        expect(seen[0]).toMatchObject({ replayState: "running", replay: { rounds: [{}], outcome: null } });
        expect(await incident(stored)).toMatchObject({ replay: { rounds: [{}, {}], outcome: "could not reproduce" } });
    });

    it("stops at the cap, and goes on from the saved rounds once the cap is raised", async () => {
        const model = payingModel();
        const stored = await replayDue();
        // One round played before, with most of the cap spent
        await test.db
            .updateTable("incidents")
            .set({ spent_usd: 4.99, replay: JSON.stringify({ rounds: [round(4, 0)] }) })
            .where("id", "=", stored.id)
            .execute();

        expect(await runReplayJob({ db: test.db, openai: OPENAI, fetch: model.fetch }, await claim(test.db))).toBe(
            "cap reached",
        );
        expect(model.bodies).toHaveLength(0);
        expect(await incident(stored)).toMatchObject({ replayState: "done", replay: { outcome: "cap reached" } });

        expect(await requestReplay(test.db, stored.projectId, stored.id, { by: "ana@acme.com", raiseCapUsd: 5 })).toBe(
            "started",
        );
        expect(await runReplayJob({ db: test.db, openai: OPENAI, fetch: model.fetch }, await claim(test.db))).toBe(
            "confirmed",
        );
        expect(await incident(stored)).toMatchObject({
            capUsd: 10,
            spentUsd: expect.closeTo(4.99 + 10 * CALL_USD, 9),
            replay: { rounds: [{ with: { harmful: 4 } }, { with: { harmful: 5 } }], outcome: "confirmed" },
        });
        expect(model.bodies).toHaveLength(10);
    });

    it("ends with the error of a failed call", async () => {
        const fetch: Fetch = async () => new Response("down", { status: 500 });
        const stored = await replayDue();

        expect(await runReplayJob({ db: test.db, openai: OPENAI, fetch }, await claim(test.db))).toBe(
            "failed: The model call failed with status 500",
        );
        expect(await incident(stored)).toMatchObject({
            replayState: "failed",
            replay: { rounds: [], outcome: null, error: "The model call failed with status 500" },
        });
    });

    it("is limited when the turning-point request was not recorded", async () => {
        const stored = await replayDue({ recorded: false });

        expect(await runReplayJob({ db: test.db, openai: OPENAI }, await claim(test.db))).toBe(NOT_RECORDED);
        expect(await incident(stored)).toMatchObject({
            replayState: "done",
            replay: { model: "gpt-5.4-mini", limited: NOT_RECORDED, outcome: null },
        });
    });

    it("asks for a provider key", async () => {
        const stored = await replayDue();

        expect(await runReplayJob(offline(), await claim(test.db))).toBe(`failed: ${NO_KEY}`);
        expect(await incident(stored)).toMatchObject({ replayState: "failed", replay: { error: NO_KEY } });
    });
});

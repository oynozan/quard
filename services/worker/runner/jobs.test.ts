import { requestReplay, type Db } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { replay } from "../../../db/test/incidents.ts";
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
});

// Reads of the table fail, or every read without one, as on a broken connection
function failingReads(db: Db, table?: string): Db {
    return db.withPlugin({
        transformQuery: ({ node }) => {
            const hit = table === undefined || JSON.stringify(node).includes(`"name":"${table}"`);
            if (node.kind === "SelectQueryNode" && hit) {
                throw new Error(`reads of ${table ?? "every table"} fail in this test`);
            }
            return node;
        },
        transformResult: async ({ result }) => result,
    });
}

const RUNS_FAIL = "reads of runs fail in this test";

async function row(id: string) {
    return test.db
        .selectFrom("incidents")
        .select(["find_state", "find_error", "replay_state", "replay", "leased_until", "run_after", "errors"])
        .where("id", "=", id)
        .executeTakeFirstOrThrow();
}

// The retry delay passed
async function due(id: string) {
    await test.db
        .updateTable("incidents")
        .set({ run_after: new Date(Date.now() - 1000) })
        .where("id", "=", id)
        .execute();
}

// Runs the job until it fails for good, returning each line
async function throwUntilFailed(id: string): Promise<string[]> {
    const deps = { db: failingReads(test.db, "runs"), openai: undefined };
    const lines: string[] = [];
    for (let run = 0; run < 5; run += 1) {
        await due(id);
        lines.push(String(await runNextJob(deps)));
    }
    return lines;
}

describe("runNextJob", () => {
    it("finds nothing to do when no job is due", async () => {
        expect(await runNextJob({ db: test.db, openai: undefined })).toBeUndefined();
    });

    it("finds the verdict, then replays once asked", async () => {
        const model = payingModel();
        const deps = { db: test.db, openai: OPENAI, fetch: model.fetch };
        const { projectId, id } = await storeAttack(test.db);

        expect(await runNextJob(deps)).toBe(`find ${id}: verdict: bad input`);
        expect(await runNextJob(deps)).toBeUndefined();
        expect(model.bodies).toHaveLength(0);

        await requestReplay(test.db, projectId, id, { by: "ana@acme.com" });
        expect(await runNextJob(deps)).toBe(`replay ${id}: confirmed`);
    });
});

describe("a job that throws", () => {
    it("frees its lease, counts the error and runs again after a delay", async () => {
        const { id } = await storeAttack(test.db);

        const line = await runNextJob({ db: failingReads(test.db, "runs"), openai: undefined });

        expect(line).toBe(`find ${id}: failed: ${RUNS_FAIL}; trying again in 15 s`);
        const freed = await row(id);
        expect(freed).toMatchObject({ find_state: "pending", leased_until: null, errors: 1 });
        expect(freed.run_after.getTime()).toBeGreaterThan(Date.now() + 10_000);
        expect(freed.run_after.getTime()).toBeLessThan(Date.now() + 20_000);
        expect(await runNextJob({ db: test.db, openai: undefined })).toBeUndefined();

        await due(id);
        expect(await runNextJob({ db: test.db, openai: undefined })).toBe(`find ${id}: verdict: bad input`);
        expect((await row(id)).errors).toBe(0);
    });

    it("fails a find job with the error after five errors in a row", async () => {
        const { id } = await storeAttack(test.db);

        expect(await throwUntilFailed(id)).toEqual([
            `find ${id}: failed: ${RUNS_FAIL}; trying again in 15 s`,
            `find ${id}: failed: ${RUNS_FAIL}; trying again in 30 s`,
            `find ${id}: failed: ${RUNS_FAIL}; trying again in 60 s`,
            `find ${id}: failed: ${RUNS_FAIL}; trying again in 120 s`,
            `find ${id}: failed after 5 errors in a row: ${RUNS_FAIL}`,
        ]);

        expect(await row(id)).toMatchObject({ find_state: "failed", find_error: RUNS_FAIL, leased_until: null });
        await due(id);
        expect(await runNextJob({ db: test.db, openai: undefined })).toBeUndefined();
    });

    it("fails a replay after five errors in a row, keeping its rounds, and lets it be asked for again", async () => {
        const { projectId, id } = await storeAttack(test.db);
        await runNextJob({ db: test.db, openai: undefined });
        const round = {
            with: { runs: 5, harmful: 5 },
            without: { runs: 5, harmful: 0 },
            pValue: 0.004,
            costUsd: 0.4,
            finishedAt: "2026-10-04T10:00:00.000Z",
        };
        const saved = replay({ rounds: [round] });
        await test.db
            .updateTable("incidents")
            .set({ replay_state: "requested", replay: JSON.stringify(saved) })
            .where("id", "=", id)
            .execute();

        const lines = await throwUntilFailed(id);

        expect(lines[0]).toBe(`replay ${id}: failed: ${RUNS_FAIL}; trying again in 15 s`);
        expect(lines[4]).toBe(`replay ${id}: failed after 5 errors in a row: ${RUNS_FAIL}`);
        expect(await row(id)).toMatchObject({
            replay_state: "failed",
            replay: { ...saved, error: RUNS_FAIL },
            leased_until: null,
            errors: 0,
        });
        expect(await requestReplay(test.db, projectId, id, { by: "ana@acme.com" })).toBe("started");
        expect(await row(id)).toMatchObject({ replay_state: "requested", replay: { ...saved, error: null } });
    });

    it("keeps its lease when even the error can't be saved", async () => {
        const { id } = await storeAttack(test.db);
        const broken = "reads of every table fail in this test";

        const line = await runNextJob({ db: failingReads(test.db), openai: undefined });

        expect(line).toBe(`find ${id}: failed: ${broken}; could not save the error: ${broken}`);
        const kept = await row(id);
        expect(kept.leased_until?.getTime()).toBeGreaterThan(Date.now() + 5 * 60_000);
        expect(kept.errors).toBe(0);
    });
});

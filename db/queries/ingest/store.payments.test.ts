import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { item, payment, RUN, started } from "../../test/events.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { ingestBatch } from "./store.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const spend = (projectId: string) =>
    test.db
        .selectFrom("runs")
        .select(["spend_usd", "spend_known", "last_event_at"])
        .where("project_id", "=", projectId)
        .where("run_id", "=", RUN)
        .executeTakeFirstOrThrow();

describe("ingestBatch with x402 payments", () => {
    it("stores each payment event as a payments row", async () => {
        const projectId = await createProject(test.db, "Acme");
        const big = "1" + "0".repeat(70);
        const batch = [
            item(started()),
            item(payment({ stage: "challenged", transaction: undefined })),
            item(payment({ stage: "signed", transaction: undefined, amount: big })),
            item(payment({ delivered: true })),
        ];

        expect(await ingestBatch(test.db, projectId, batch)).toBe(4);

        const rows = await test.db
            .selectFrom("payments")
            .select(["event_id", "stage", "amount", "tx_hash", "delivered", "pay_to"])
            .where("project_id", "=", projectId)
            .orderBy("stage")
            .execute();
        expect(rows).toEqual([
            expect.objectContaining({ stage: "challenged", amount: "50000", tx_hash: null, delivered: null }),
            expect.objectContaining({ stage: "settled", tx_hash: "0x" + "ab".repeat(32), delivered: true }),
            // numeric keeps big atomic amounts exact
            expect.objectContaining({ stage: "signed", amount: big }),
        ]);
        expect(rows[1]?.pay_to).toBe("0x209693Bc6afc0C5328bA36FaF03C514EF312287C");
    });

    it("adds settled payments to the run's spend once, even when resent", async () => {
        const projectId = await createProject(test.db, "Acme");
        const batch = [
            item(started()),
            item(payment({ stage: "signed" })),
            item(payment()),
            item(payment({ stage: "failed", usd: 0.5 })),
            item(payment({ usd: 0.25, at: "2026-10-03T12:00:09.000Z" })),
        ];
        await ingestBatch(test.db, projectId, batch);

        expect(await spend(projectId)).toMatchObject({ spend_usd: 0.3, spend_known: true });
        expect(await ingestBatch(test.db, projectId, batch)).toBe(0);
        expect(await spend(projectId)).toMatchObject({ spend_usd: 0.3, spend_known: true });
    });

    it("counts a payment as run activity", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [item(started())]);
        await ingestBatch(test.db, projectId, [item(payment({ stage: "challenged" }))]);

        const run = await spend(projectId);
        expect(run.last_event_at.toISOString()).toBe("2026-10-03T12:00:07.000Z");
        expect(run).toMatchObject({ spend_usd: 0, spend_known: true });
    });

    it("marks the spend unknown when a settled token has no USD value", async () => {
        const projectId = await createProject(test.db, "Acme");
        await ingestBatch(test.db, projectId, [item(started()), item(payment({ stage: "challenged", usd: null }))]);
        expect(await spend(projectId)).toMatchObject({ spend_usd: 0, spend_known: true });

        await ingestBatch(test.db, projectId, [item(payment({ asset: "0xabc", usd: null })), item(payment())]);
        expect(await spend(projectId)).toMatchObject({ spend_usd: 0.05, spend_known: false });
    });
});

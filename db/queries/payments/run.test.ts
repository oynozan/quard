import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addPayments, addRun, payment, PAYEE, runOf, USDC } from "../../test/payments.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { runPayments } from "./run.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

describe("runPayments", () => {
    it("lists one run's payment events oldest first, with big amounts exact", async () => {
        const projectId = await createProject(test.db, "Acme");
        await addRun(test.db, projectId, runOf(1));
        await addRun(test.db, projectId, runOf(2));
        const big = "123456789012345678901234567890";
        await addPayments(test.db, [
            payment(projectId, runOf(1), "2026-10-03T12:00:02.000Z", {
                stage: "settled",
                tx_hash: "0xabc",
                delivered: false,
            }),
            payment(projectId, runOf(1), "2026-10-03T12:00:01.000Z", {
                stage: "challenged",
                amount: big,
                usd: null,
                asset: "0xother",
            }),
            payment(projectId, runOf(2), "2026-10-03T12:00:00.000Z"),
        ]);

        const rows = await runPayments(test.db, projectId, runOf(1));

        expect(rows.map((row) => row.stage)).toEqual(["challenged", "settled"]);
        expect(rows[0]).toMatchObject({ amount: big, usd: null, asset: "0xother", txHash: null, delivered: null });
        expect(rows[1]).toMatchObject({
            stepId: "5".repeat(16),
            agent: "billing",
            host: "api.example.com",
            resource: "https://api.example.com/data",
            x402Version: 2,
            scheme: "exact",
            network: "eip155:8453",
            asset: USDC,
            amount: "10000",
            usd: 0.01,
            payTo: PAYEE,
            txHash: "0xabc",
            delivered: false,
            reason: null,
            at: new Date("2026-10-03T12:00:02.000Z"),
        });
    });

    it("is empty for a run without payments", async () => {
        const projectId = await createProject(test.db, "Acme");
        await addRun(test.db, projectId, runOf(1));

        expect(await runPayments(test.db, projectId, runOf(1))).toEqual([]);
    });
});

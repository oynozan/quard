import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addPayments, addRun, payment, PAYEE, runOf } from "../../test/payments.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { newPayees, quarantinedPayees } from "./payees.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const range = { since: new Date("2026-10-01T00:00:00.000Z"), until: new Date("2026-10-04T00:00:00.000Z") };
const OLD = "0x" + "c".repeat(40);
const LATE = "0x" + "d".repeat(40);
const SOL = "So1anaPayee1111111111111111111111111111111";

describe("newPayees", () => {
    it("lists payees first paid in the window, newest first", async () => {
        const projectId = await createProject(test.db, "Acme");
        await addRun(test.db, projectId, runOf(1));
        await addRun(test.db, projectId, runOf(2));
        await addPayments(test.db, [
            payment(projectId, runOf(1), "2026-10-02T09:00:00.000Z", { network: "eip155:84532" }),
            payment(projectId, runOf(2), "2026-10-02T10:00:00.000Z", { agent: "research", usd: null }),
            payment(projectId, runOf(2), "2026-10-03T10:00:00.000Z", { pay_to: SOL, network: "solana:devnet" }),
            // Not settled, so not paid
            payment(projectId, runOf(1), "2026-10-01T09:00:00.000Z", { stage: "signed" }),
            // First paid before the window
            payment(projectId, runOf(1), "2026-09-30T09:00:00.000Z", { pay_to: OLD }),
            payment(projectId, runOf(1), "2026-10-02T09:00:00.000Z", { pay_to: OLD }),
            // First paid after it
            payment(projectId, runOf(1), "2026-10-04T00:00:00.000Z", { pay_to: LATE }),
        ]);

        expect(await newPayees(test.db, projectId, range)).toEqual([
            {
                payTo: SOL,
                network: "solana:devnet",
                firstPaidAt: new Date("2026-10-03T10:00:00.000Z"),
                usd: 0.01,
                payments: 1,
                unknown: 0,
                runs: 1,
                agents: ["billing"],
            },
            {
                payTo: PAYEE,
                network: "eip155:84532",
                firstPaidAt: new Date("2026-10-02T09:00:00.000Z"),
                usd: 0.01,
                payments: 2,
                unknown: 1,
                runs: 2,
                agents: ["billing", "research"],
            },
        ]);
    });
});

describe("quarantinedPayees", () => {
    it("lists quarantined wallets with their uses and what they were paid", async () => {
        const projectId = await createProject(test.db, "Acme");
        await addRun(test.db, projectId, runOf(1));
        await addRun(test.db, projectId, runOf(2));
        const checksummed = "0x" + "A".repeat(40);
        await test.db
            .insertInto("fleet_values")
            .values([
                {
                    project_id: projectId,
                    key: `wallet:${checksummed}`,
                    kind: "wallet",
                    field: "payTo",
                    first_seen_at: "2026-10-01T00:00:00.000Z",
                    quarantined_at: "2026-10-02T00:00:00.000Z",
                },
                {
                    project_id: projectId,
                    key: `wallet:${SOL}`,
                    kind: "wallet",
                    field: "payTo",
                    first_seen_at: "2026-10-01T00:00:00.000Z",
                    quarantined_at: "2026-10-03T00:00:00.000Z",
                },
                // Watched but not quarantined, or not a wallet
                { project_id: projectId, key: `wallet:${OLD}`, kind: "wallet", field: "payTo", quarantined_at: null },
                {
                    project_id: projectId,
                    key: "domain:evil.com",
                    kind: "domain",
                    field: "url",
                    quarantined_at: "2026-10-03T00:00:00.000Z",
                },
            ])
            .execute();
        await test.db
            .insertInto("fleet_uses")
            .values([
                {
                    project_id: projectId,
                    key: `wallet:${checksummed}`,
                    run_id: runOf(1),
                    agent: "billing",
                    tool: "x402",
                    blocked: false,
                },
                {
                    project_id: projectId,
                    key: `wallet:${checksummed}`,
                    run_id: runOf(2),
                    agent: "billing",
                    tool: "x402",
                    blocked: true,
                },
                {
                    project_id: projectId,
                    key: `wallet:${checksummed}`,
                    run_id: runOf(2),
                    agent: "billing",
                    tool: "x402",
                    blocked: true,
                },
            ])
            .execute();
        await addPayments(test.db, [
            // Lowercase in the payment, checksummed in the fleet key
            payment(projectId, runOf(1), "2026-10-01T09:00:00.000Z", { usd: 0.5 }),
            payment(projectId, runOf(1), "2026-10-01T09:00:00.000Z", { usd: null }),
            payment(projectId, runOf(1), "2026-10-01T09:00:00.000Z", { stage: "signed", usd: 9 }),
            // A Solana address only matches in its own case
            payment(projectId, runOf(1), "2026-10-01T09:00:00.000Z", { pay_to: SOL.toLowerCase(), usd: 9 }),
        ]);

        expect(await quarantinedPayees(test.db, projectId)).toEqual([
            {
                address: SOL,
                field: "payTo",
                firstSeenAt: new Date("2026-10-01T00:00:00.000Z"),
                quarantinedAt: new Date("2026-10-03T00:00:00.000Z"),
                observe: false,
                runs: 0,
                blockedAttempts: 0,
                usd: 0,
                payments: 0,
            },
            {
                address: checksummed,
                field: "payTo",
                firstSeenAt: new Date("2026-10-01T00:00:00.000Z"),
                quarantinedAt: new Date("2026-10-02T00:00:00.000Z"),
                observe: false,
                runs: 2,
                blockedAttempts: 2,
                usd: 0.5,
                payments: 2,
            },
        ]);
    });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addPayments, addRun, payment, PAYEE, runOf } from "../../test/payments.ts";
import { startTestDb, type TestDb } from "../../test/pglite.ts";
import { createProject } from "../projects.ts";
import { spendBy, spendByDay } from "./spend.ts";

let test: TestDb;

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

afterAll(async () => {
    await test.stop();
});

const range = { since: new Date("2026-10-01T00:00:00.000Z"), until: new Date("2026-10-04T00:00:00.000Z") };
const OTHER = "0x" + "b".repeat(40);

async function projectWithPayments(): Promise<string> {
    const projectId = await createProject(test.db, "Acme");
    await addRun(test.db, projectId, runOf(1));
    await addPayments(test.db, [
        payment(projectId, runOf(1), "2026-10-01T09:00:00.000Z", { usd: 0.25 }),
        payment(projectId, runOf(1), "2026-10-01T10:00:00.000Z", { usd: 0.5, agent: "research" }),
        // A token with no known USD value
        payment(projectId, runOf(1), "2026-10-03T23:59:59.999Z", { usd: null, host: "pay.evil.com", pay_to: OTHER }),
        // Not settled, or outside the window
        payment(projectId, runOf(1), "2026-10-02T10:00:00.000Z", { stage: "signed", usd: 9 }),
        payment(projectId, runOf(1), "2026-10-02T10:00:00.000Z", { stage: "failed", usd: 9 }),
        payment(projectId, runOf(1), "2026-09-30T23:59:59.999Z", { usd: 9 }),
        payment(projectId, runOf(1), "2026-10-04T00:00:00.000Z", { usd: 9 }),
    ]);
    return projectId;
}

describe("spendByDay", () => {
    it("sums settled payments per day from since, leaving empty days out", async () => {
        const projectId = await projectWithPayments();

        expect(await spendByDay(test.db, projectId, range)).toEqual([
            { day: 0, usd: 0.75, payments: 2, unknown: 0 },
            { day: 2, usd: 0, payments: 1, unknown: 1 },
        ]);
    });
});

describe("spendBy", () => {
    it("ranks agents, hosts and payees by spend", async () => {
        const projectId = await projectWithPayments();

        expect(await spendBy(test.db, projectId, "agent", range)).toEqual([
            { key: "research", usd: 0.5, payments: 1, unknown: 0 },
            { key: "billing", usd: 0.25, payments: 2, unknown: 1 },
        ]);
        expect(await spendBy(test.db, projectId, "host", range)).toEqual([
            { key: "api.example.com", usd: 0.75, payments: 2, unknown: 0 },
            { key: "pay.evil.com", usd: 0, payments: 1, unknown: 1 },
        ]);
        expect(await spendBy(test.db, projectId, "payTo", range)).toEqual([
            { key: PAYEE, usd: 0.75, payments: 2, unknown: 0 },
            { key: OTHER, usd: 0, payments: 1, unknown: 1 },
        ]);
    });

    it("breaks ties by count, then by key", async () => {
        const projectId = await createProject(test.db, "Acme");
        await addRun(test.db, projectId, runOf(1));
        await addPayments(test.db, [
            payment(projectId, runOf(1), "2026-10-01T09:00:00.000Z", { host: "b.com", usd: null }),
            payment(projectId, runOf(1), "2026-10-01T09:00:00.000Z", { host: "c.com", usd: null }),
            payment(projectId, runOf(1), "2026-10-01T09:00:00.000Z", { host: "c.com", usd: null }),
            payment(projectId, runOf(1), "2026-10-01T09:00:00.000Z", { host: "a.com", usd: null }),
        ]);

        const hosts = await spendBy(test.db, projectId, "host", range);

        expect(hosts.map((row) => row.key)).toEqual(["c.com", "a.com", "b.com"]);
    });
});

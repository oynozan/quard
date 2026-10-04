// @vitest-environment node
import { createProject } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { addPayment, addRun } from "../../../../test/payments/rows";
import { emptySpend, OTHER, PAYEE } from "../../../../test/payments/spend";
import { START_AT } from "../../../../test/summary/fleet";
import { DAY, HOUR, NOW } from "../../../../test/time";

const requireSession = vi.hoisted(() => vi.fn(async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 })));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const { getSpend } = await import("./spend");
const { database } = await import("../runs/live/client");

let test: TestDb;
let clock: MockInstance<() => number>;

beforeAll(async () => {
    test = await startTestDb();
    vi.stubEnv("DATABASE_URL", test.url);
    vi.stubEnv("QUARD_PROJECT_ID", "");
}, 60_000);

beforeEach(() => {
    clock = vi.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
    clock.mockRestore();
});

afterAll(async () => {
    await database().destroy();
    vi.unstubAllEnvs();
    await test.stop();
});

const RUN = "1".repeat(32);
const TODAY = START_AT + 29 * DAY;

describe("getSpend", () => {
    it("is empty before a project exists", async () => {
        expect(await getSpend()).toEqual(emptySpend());
        expect(requireSession).toHaveBeenCalled();
    });

    it("sums settled spend per day and by agent, host and payee, with new and quarantined payees", async () => {
        const projectId = await createProject(test.db, "Paid");
        vi.stubEnv("QUARD_PROJECT_ID", projectId);
        await addRun(test.db, projectId, RUN);
        await addPayment(test.db, projectId, RUN, TODAY + HOUR, { usd: 0.25 });
        await addPayment(test.db, projectId, RUN, TODAY - 2 * DAY, { usd: 0.5, agent: "research" });
        await addPayment(test.db, projectId, RUN, TODAY + 2 * HOUR, { usd: null, payTo: OTHER, host: "pay.evil.com" });
        // Not settled, or before the window
        await addPayment(test.db, projectId, RUN, TODAY, { stage: "signed", usd: 9 });
        await addPayment(test.db, projectId, RUN, START_AT - 1, { usd: 9, payTo: "0x" + "c".repeat(40) });
        await test.db
            .insertInto("fleet_values")
            .values({
                project_id: projectId,
                key: `wallet:${OTHER}`,
                kind: "wallet",
                field: "payTo",
                first_seen_at: new Date(TODAY),
                quarantined_at: new Date(TODAY + 3 * HOUR),
            })
            .execute();

        const spend = await getSpend();

        expect(spend.byDay[27]).toBe(0.5);
        expect(spend.byDay[29]).toBe(0.25);
        expect(spend).toMatchObject({ totalUsd: 0.75, payments: 3, unknown: 1, startAt: START_AT, endAt: NOW });
        expect(spend.byAgent).toEqual([
            { label: "research", usd: 0.5, payments: 1, unknown: 0 },
            { label: "billing", usd: 0.25, payments: 2, unknown: 1 },
        ]);
        expect(spend.byHost.map((item) => item.label)).toEqual(["api.example.com", "pay.evil.com"]);
        expect(spend.byPayee.map((item) => item.label)).toEqual([PAYEE, OTHER]);
        expect(spend.newPayees).toEqual([
            {
                payTo: OTHER,
                network: "eip155:8453",
                firstPaidAt: TODAY + 2 * HOUR,
                usd: 0,
                payments: 1,
                unknown: 1,
                runs: 1,
                agents: ["billing"],
            },
            expect.objectContaining({ payTo: PAYEE, firstPaidAt: TODAY - 2 * DAY, usd: 0.75 }),
        ]);
        expect(spend.quarantined).toEqual([
            {
                address: OTHER,
                quarantinedAt: TODAY + 3 * HOUR,
                observe: false,
                runs: 0,
                blockedAttempts: 0,
                usd: 0,
                payments: 1,
            },
        ]);
    });
});

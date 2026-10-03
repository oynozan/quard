import { dayCounts, markValueKnown, quarantineList } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { guard, isGuardRefusal, quard, type RunEvent } from "../../../packages/sdk/index.ts";
import { dayUsed } from "../../../packages/sdk/guards/limit/daily.ts";
import { resetAll } from "../../../packages/sdk/test/reset.ts";
import { activeControl } from "../../../packages/sdk/transport/link/active.ts";
import { utcDay } from "../connect/hello.ts";
import { newProject, type TestProject } from "../test/context.ts";
import { only, startTestControl, type TestControl } from "../test/server.ts";

// Per-day limits and the fleet check with the real SDK, control on a free port and PGlite

const HASH_KEY = "ab".repeat(32);
const INVOICE = { iban: "DE89370400440532013000", amount: 120 };
const DAY_MS = 24 * 60 * 60 * 1000;
const WAIT = { timeout: 10_000, interval: 20 };

let test: TestDb;
let control: TestControl;
let project: TestProject;
let events: RunEvent[] = [];

beforeAll(async () => {
    test = await startTestDb();
}, 60_000);

beforeEach(async () => {
    project = await newProject(test.db);
    control = await startTestControl(test);
    events = [];
});

afterEach(async () => {
    resetAll();
    await control.close();
});

afterAll(async () => {
    await test.stop();
});

// Links this process's SDK and waits until control answered its hello
async function linkSdk(): Promise<void> {
    quard.configure({
        key: project.key,
        controlUrl: `http://127.0.0.1:${control.port}`,
        hashKey: HASH_KEY,
        onEvent: (event) => events.push(event),
    });
    await vi.waitFor(() => expect(activeControl()?.link.ready()).toBe(true), WAIT);
}

// A payInvoice that watches its IBAN, called once per new run
function payTool() {
    const rawPay = vi.fn(async (_input: typeof INVOICE) => "paid");
    const payInvoice = guard(rawPay, { type: "limit", name: "payInvoice", fleetCheck: ["iban"] });
    return { rawPay, pay: () => quard.run({ agent: "billing" }, () => payInvoice({ ...INVOICE })) };
}

async function payInRuns(pay: () => Promise<unknown>, runs: number): Promise<unknown[]> {
    const results: unknown[] = [];
    for (let run = 0; run < runs; run += 1) {
        results.push(await pay());
    }
    return results;
}

function reasonOf(result: unknown): string | undefined {
    return isGuardRefusal(result) ? result.reason : undefined;
}

// The refused calls control has recorded as blocked uses
async function blockedUses(): Promise<number> {
    const rows = await test.db
        .selectFrom("fleet_uses")
        .select("id")
        .where("project_id", "=", project.projectId)
        .where("blocked", "=", true)
        .execute();
    return rows.length;
}

describe("per-day limits through control", { timeout: 30_000 }, () => {
    it("counts calls for the whole project, and a new process starts from the day's count", async () => {
        await linkSdk();
        const rawSend = vi.fn(async (_input: { to: string }) => "sent");
        const options = { type: "limit", name: "sendEmail", maxCallsPerDay: 2 } as const;
        const sendEmail = guard(rawSend, options);

        expect(await sendEmail({ to: "a@acme.com" })).toBe("sent");
        expect(await sendEmail({ to: "b@acme.com" })).toBe("sent");
        expect(reasonOf(await sendEmail({ to: "c@acme.com" }))).toBe("daily_limit_reached");
        const today = utcDay(new Date());
        const counted = [{ tool: "sendEmail", counter: "calls", day: today, used: 2 }];
        expect(await dayCounts(test.db, project.projectId, today)).toEqual(counted);

        resetAll();
        await linkSdk();

        expect(dayUsed(today, "sendEmail", "calls")).toBe(2);
        expect(reasonOf(await guard(rawSend, options)({ to: "d@acme.com" }))).toBe("daily_limit_reached");
        expect(rawSend).toHaveBeenCalledTimes(2);
        expect(await dayCounts(test.db, project.projectId, today)).toEqual(counted);
    });
});

describe("the fleet check through control", { timeout: 30_000 }, () => {
    it("only records would-block in its first 7 days", async () => {
        await linkSdk();
        const { rawPay, pay } = payTool();

        expect(await payInRuns(pay, 6)).toEqual(Array(6).fill("paid"));

        expect(rawPay).toHaveBeenCalledTimes(6);
        expect(await quarantineList(test.db, project.projectId)).toEqual([
            { key: expect.stringMatching(/^iban:/), observe: true },
        ]);
        expect(events).toContainEqual(
            expect.objectContaining({ rule: "fleet-check", decision: "block", mode: "observe", field: "iban" }),
        );
    });

    it("blocks a new IBAN used in five runs, and lets it through once someone marks it as known", async () => {
        // Past its 7 observe-only days, so the check enforces
        const started = new Date(Date.now() - 8 * DAY_MS);
        await test.db
            .updateTable("projects")
            .set({ fleet_started_at: started })
            .where("id", "=", project.projectId)
            .execute();
        await linkSdk();
        const { rawPay, pay } = payTool();

        const results = await payInRuns(pay, 6);

        expect(results.slice(0, 4)).toEqual(["paid", "paid", "paid", "paid"]);
        expect(results.slice(4).map(reasonOf)).toEqual(["value_quarantined", "value_quarantined"]);
        const { key, observe } = only(await quarantineList(test.db, project.projectId));
        expect(observe).toBe(false);
        // No answer about a refused call can then reach the SDK after the value is known
        await vi.waitFor(async () => expect(await blockedUses()).toBe(2), WAIT);

        await markValueKnown(test.db, project.projectId, key, "dana@acme.com");
        await vi.waitFor(() => expect(activeControl()?.fleet.entry(key, Date.now())).toBeUndefined(), WAIT);

        expect(await pay()).toBe("paid");
        expect(rawPay).toHaveBeenCalledTimes(5);
    });
});

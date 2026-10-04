// @vitest-environment node
import { createProject, ingestBatch, listIncidents, saveVerdict } from "@quard/db";
import { startTestDb, type TestDb } from "@quard/db/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { block, delegate, itemsOf, modelCall, runOf, stepOf, webPage } from "../../../../test/summary/events";
import { storedVerdict } from "../../../../test/incidents/rows";
import { emptyFleet, START_AT } from "../../../../test/summary/fleet";
import { DAY, HOUR, MINUTE, NOW, SECOND } from "../../../../test/time";

const requireSession = vi.hoisted(() => vi.fn(async () => ({ sub: "did:privy:1", email: null, github: null, exp: 0 })));
vi.mock("@/lib/auth/session", () => ({ requireSession }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

const { getFleet } = await import("./query");
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

// A fresh project that the dashboard reads
async function project(name: string): Promise<string> {
    const id = await createProject(test.db, name);
    vi.stubEnv("QUARD_PROJECT_ID", id);
    return id;
}

const RUN = runOf(1);
const TODAY = START_AT + 29 * DAY;

describe("getFleet", () => {
    it("is empty before a project exists, over the 30 UTC days up to now", async () => {
        expect(await getFleet()).toEqual(emptyFleet());
        expect(requireSession).toHaveBeenCalled();
    });

    it("is empty for a new project that has not sent anything", async () => {
        await project("Main");

        expect(await getFleet()).toEqual(emptyFleet());
    });

    it("counts enforced blocks of the six guards per UTC day, weekday and hour", async () => {
        const id = await project("Main");
        const other = await createProject(test.db, "Other");
        await ingestBatch(
            test.db,
            id,
            itemsOf(
                // Friday 4 Sep at 09:05, the window's first day
                block(RUN, START_AT + 9 * HOUR + 5 * MINUTE, "source"),
                // Monday 28 Sep at 23:30
                block(RUN, START_AT + 24 * DAY + 23 * HOUR + 30 * MINUTE, "limit", { rule: "max-calls-per-run" }),
                // Today, a Saturday, twice in one hour and once just before now
                block(RUN, TODAY + 10 * HOUR + 15 * MINUTE, "egress"),
                block(RUN, TODAY + 10 * HOUR + 45 * MINUTE, "egress"),
                block(RUN, NOW - SECOND, "permission", { rule: "requested-call" }),
                // Left out as outside the window, not a dashboard guard, observed, asked or allowed
                block(RUN, START_AT - 1, "source"),
                block(RUN, NOW, "action"),
                block(RUN, TODAY + HOUR, "signature", { rule: "PROMPT-INJECTION-1" }),
                block(RUN, TODAY + HOUR, "action", { mode: "observe", enforced: false }),
                block(RUN, TODAY + HOUR, "approval", { decision: "ask" }),
                block(RUN, TODAY + HOUR, "limit", { decision: "allow", reason: undefined }),
            ),
        );
        await ingestBatch(test.db, other, itemsOf(block(RUN, TODAY + HOUR, "source")));

        const { blocksByGuard, blocksHeatmap, untrustedLinks } = await getFleet();

        expect(blocksByGuard.startAt).toBe(START_AT);
        expect(blocksByGuard.series.map((row) => [row.guard, row.total])).toEqual([
            ["source", 1],
            ["action", 0],
            ["egress", 2],
            ["limit", 1],
            ["approval", 0],
            ["permission", 1],
        ]);
        expect(blocksByGuard.series[0].values[0]).toBe(1);
        expect(blocksByGuard.series[2].values[29]).toBe(2);
        expect(blocksByGuard.series[3].values[24]).toBe(1);
        expect(blocksByGuard.series[5].values[29]).toBe(1);
        expect(blocksByGuard.totals.flatMap((count, day) => (count ? [[day, count]] : []))).toEqual([
            [0, 1],
            [24, 1],
            [29, 3],
        ]);
        const cells = blocksHeatmap.values.flatMap((hours, day) =>
            hours.flatMap((count, hour) => (count ? [[day, hour, count]] : [])),
        );
        expect(cells).toEqual([
            [0, 23, 1],
            [4, 9, 1],
            [5, 10, 2],
            [5, 18, 1],
        ]);
        expect(blocksHeatmap.hourTotals[10]).toBe(2);
        expect(blocksHeatmap.total).toBe(5);
        expect(untrustedLinks).toEqual([]);
    });

    it("lists the agent links that carried untrusted content, the largest share first", async () => {
        const id = await project("Main");
        const [parent, child, root] = [stepOf(2), stepOf(3), stepOf(1)];
        const at = TODAY + 12 * HOUR;
        // planner hands work to researcher twice, and once the page it read was untrusted
        const planned = (runId: string, untrusted: boolean) => [
            modelCall(runId, root, "planner", at),
            delegate(runId, parent, "planner", at + SECOND),
            ...(untrusted ? [webPage(runId, child, "researcher", at + 2 * SECOND)] : []),
            modelCall(runId, child, "researcher", at + 3 * SECOND, parent),
        ];
        const handoff = (runId: string, from: string, to: string, start: number, untrusted: boolean) => [
            delegate(runId, parent, from, start),
            ...(untrusted ? [webPage(runId, child, to, start + SECOND)] : []),
            modelCall(runId, child, to, start + 2 * SECOND, parent),
        ];
        await ingestBatch(
            test.db,
            id,
            itemsOf(
                ...planned(runOf(11), true),
                ...planned(runOf(12), false),
                ...handoff(runOf(13), "researcher", "billing", at, true),
                ...handoff(runOf(14), "support", "billing", at, false),
                // Before the window
                ...handoff(runOf(15), "planner", "billing", START_AT - DAY, true),
            ),
        );

        const { untrustedLinks, blocksHeatmap } = await getFleet();

        expect(untrustedLinks).toEqual([
            { from: "researcher", to: "billing", delegations: 1, untrusted: 1, untrustedShare: 1 },
            { from: "planner", to: "researcher", delegations: 2, untrusted: 1, untrustedShare: 0.5 },
        ]);
        expect(blocksHeatmap.total).toBe(0);
    });

    it("counts the runs that went over each run limit, observed apart from stopped", async () => {
        await project("Main");
        const id = await project("Limits");
        const over = (n: number, at: number, rule: string, more = {}) =>
            block(runOf(n), at, "limit", { rule, reason: "limit_reached", ...more });
        const observed = { mode: "observe", enforced: false } as const;
        await ingestBatch(
            test.db,
            id,
            itemsOf(
                over(21, TODAY + HOUR, "max-depth", observed),
                over(22, TODAY + HOUR, "max-depth", observed),
                // Switched on later: a refused model call over the step limit
                over(23, TODAY + 2 * HOUR, "max-steps", { tool: "gpt-5.4-mini" }),
                // Before the window
                over(24, START_AT - DAY, "max-loops"),
            ),
        );

        const { runLimits } = await getFleet();

        expect(runLimits).toEqual([
            { name: "depth", rule: "max-depth", mode: "observe", wouldStop: 2, stopped: 0 },
            { name: "fan-out", rule: "max-fan-out", mode: "block", wouldStop: 0, stopped: 0 },
            { name: "loops", rule: "max-loops", mode: "block", wouldStop: 0, stopped: 0 },
            { name: "steps", rule: "max-steps", mode: "block", wouldStop: 0, stopped: 1 },
            { name: "cost", rule: "max-cost", mode: "block", wouldStop: 0, stopped: 0 },
        ]);
    });

    it("counts incidents with a verdict by entry source, damaging tool and agent", async () => {
        const id = await project("Main");
        await ingestBatch(
            test.db,
            id,
            itemsOf(
                block(runOf(21), TODAY + HOUR, "action"),
                block(runOf(22), TODAY + 2 * HOUR, "action"),
                // Opened before the window, and one still being found
                block(runOf(23), START_AT - DAY, "action"),
                block(runOf(24), TODAY + 3 * HOUR, "action"),
            ),
        );
        const [, second, first, old] = await listIncidents(test.db, id, { limit: 10 });
        const verdict = storedVerdict();
        await saveVerdict(test.db, id, second.id, verdict);
        await saveVerdict(test.db, id, old.id, verdict);
        await saveVerdict(test.db, id, first.id, {
            ...verdict,
            entry: { ...verdict.entry, agent: "support", origin: "user", trust: "trusted" },
            turning: { ...verdict.turning, agent: "support" },
            damage: { ...verdict.damage, tool: "sendEmail" },
        });

        const { incidentsBySource, incidentsByTool, agentPoints } = await getFleet();

        expect(incidentsBySource).toEqual([
            { origin: "user", trust: "trusted", count: 1 },
            { origin: "web:acme-billing.net", trust: "untrusted", count: 1 },
        ]);
        expect(incidentsByTool).toEqual([
            { tool: "payInvoice", count: 1 },
            { tool: "sendEmail", count: 1 },
        ]);
        expect(agentPoints).toEqual([
            { agent: "billing", entry: 1, turning: 1 },
            { agent: "support", entry: 1, turning: 1 },
        ]);
    });

    it("stops at the sign-in redirect for people who are not signed in", async () => {
        requireSession.mockRejectedValueOnce(new Error("redirect:/sign-in"));

        await expect(getFleet()).rejects.toThrow("redirect:/sign-in");
    });
});

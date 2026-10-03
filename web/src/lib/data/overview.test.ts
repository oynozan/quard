// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENTS } from "./agents";
import { blockRatePerDay, BLOCK_RATE_START, modelCallsPer10Min, runsPerHour } from "./activity";
import { openApprovals } from "./approvals";
import { latestDecisions } from "./events";
import { recentIncidents } from "./incidents";
import { getOverview } from "./overview";
import { NOW } from "./rng";
import { recentRuns } from "./runs";

afterEach(() => {
    vi.doUnmock("./rng");
    vi.resetModules();
});

// A fresh copy of the overview with the mock clock at this UTC hour and these agents running.
async function overviewAt(hour: number, running: string[] | null = null) {
    vi.resetModules();
    vi.doMock("./rng", async (importOriginal) => ({
        ...(await importOriginal<typeof import("./rng")>()),
        NOW: Date.UTC(2026, 9, 3, hour, 0),
    }));
    const roster = await import("./agents/roster");
    if (running) {
        for (const agent of roster.AGENTS) {
            agent.state = running.includes(agent.name) ? "running" : "idle";
        }
    }
    const fresh = await import("./overview");
    return fresh.getOverview();
}

describe("getOverview", () => {
    it("greets by the time of day and counts the running agents", async () => {
        const overview = await getOverview();
        expect(overview.now).toBe(NOW);
        expect(overview.greeting).toBe("Good evening. 3 agents are running.");
    });

    it("says good morning before noon and good afternoon until 6 pm", async () => {
        expect((await overviewAt(9)).greeting).toBe("Good morning. 3 agents are running.");
        expect((await overviewAt(12)).greeting).toBe("Good afternoon. 3 agents are running.");
        expect((await overviewAt(17)).greeting).toBe("Good afternoon. 3 agents are running.");
    });

    it("says when one agent or no agent is running", async () => {
        expect((await overviewAt(18, ["billing"])).greeting).toBe("Good evening. One agent is running.");
        expect((await overviewAt(18, [])).greeting).toBe("Good evening. No agents are running.");
    });

    it("adds up asked and blocked decisions over the recent runs", async () => {
        const runs = recentRuns();
        const overview = await getOverview();
        expect(overview.decisions24h).toEqual({
            asked: runs.reduce((sum, run) => sum + run.decisions.asked, 0),
            blocked: runs.reduce((sum, run) => sum + run.decisions.blocked, 0),
        });
    });

    it("shows the 6 newest runs, the 4 newest incidents and the latest decisions", async () => {
        const overview = await getOverview();
        expect(overview.runs).toEqual(recentRuns().slice(0, 6));
        expect(overview.incidents.map((item) => item.id)).toEqual(
            recentIncidents()
                .slice(0, 4)
                .map((item) => item.id),
        );
        expect(overview.events).toEqual(latestDecisions());
        expect(overview.approvals).toEqual(openApprovals());
        expect(overview.agents).toBe(AGENTS);
    });

    it("gives the charts their series, the 2% block rate limit and the guard counts", async () => {
        const overview = await getOverview();
        expect(overview.activity).toEqual(modelCallsPer10Min());
        expect(overview.runsPerHour).toEqual(runsPerHour());
        expect(overview.blockRate).toEqual({ values: blockRatePerDay(), limit: 2, startAt: BLOCK_RATE_START });
        expect(overview.coverage).toEqual({ guarded: 18, seen: 21 });
        expect(overview.guardCounts.map((row) => [row.type, row.count])).toEqual([
            ["source", 2140],
            ["action", 612],
            ["egress", 344],
            ["limit", 1906],
            ["approval", 41],
        ]);
    });
});

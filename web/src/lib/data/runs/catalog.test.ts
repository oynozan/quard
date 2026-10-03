// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { HOUR, NOW } from "../rng";
import { runId } from "../../../../test/data-runs-generate/runs";
import { catalogRows, catalogRun, catalogRuns } from "./catalog";
import { OUTAGE_REASON } from "../guards/outage";
import { planFor, planFromId } from "./generate/plan";
import { PINNED_RUNS } from "./scripts/registry";
import { STORY_RUN_ID, STORY_STARTED_AT } from "./scripts/story";

const pinnedIds = new Set(PINNED_RUNS.map((run) => run.id));

describe("catalogRun", () => {
    it("gives nothing for an id that is not a run id", () => {
        expect(catalogRun("not-a-run")).toBeNull();
        expect(catalogRun("a".repeat(31))).toBeNull();
    });

    it("reads an upper-case id as the same run", () => {
        const lower = catalogRun("ab".repeat(16));
        expect(catalogRun("AB".repeat(16))).toBe(lower);
        expect(lower?.detail.summary.id).toBe("ab".repeat(16));
    });

    it("writes a pinned run from its script, with its incident and approval", () => {
        const run = catalogRun(STORY_RUN_ID)!;
        expect(run.built.startedAt).toBe(STORY_STARTED_AT);
        expect(run.detail.summary.incidentId).toBe("inc_118");
        expect(run.detail.summary.approvalId).toBe("apr_7f31");
    });

    it("places an unlisted run in time from its id, without links", () => {
        const id = runId(77);
        const run = catalogRun(id)!;
        expect(run.built.startedAt).toBe(planFromId(id).startedAt);
        expect(run.detail.summary.incidentId).toBeNull();
        expect(run.detail.summary.approvalId).toBeNull();
        expect(catalogRun(id)).toBe(run);
    });

    it("drops cached unlisted runs once too many pile up, and rebuilds them the same", () => {
        const listed = catalogRuns().length;
        const first = catalogRun(runId(1000))!;
        for (let n = 1001; n <= 1001 + 300 + listed; n++) catalogRun(runId(n));
        const again = catalogRun(runId(1000))!;
        expect(again).not.toBe(first);
        expect(again).toEqual(first);
    });
});

describe("catalogRuns", () => {
    const runs = catalogRuns();
    const rows = catalogRows();

    it("lists every pinned run and runs from the last six hours, newest first", () => {
        const starts = rows.map((row) => row.startedAt);
        expect(starts).toEqual([...starts].sort((a, b) => b - a));
        for (const id of pinnedIds) expect(rows.some((row) => row.id === id)).toBe(true);
        const generated = rows.filter((row) => !pinnedIds.has(row.id));
        expect(generated.length).toBeGreaterThan(100);
        for (const row of generated) expect(row.startedAt).toBeGreaterThan(NOW - 6 * HOUR);
    });

    it("starts the three newest generated runs seconds before now, and all three are still running", () => {
        const newest = rows.filter((row) => !pinnedIds.has(row.id)).slice(0, 3);
        expect(newest.map((row) => NOW - row.startedAt)).toEqual([7_000, 19_000, 26_000]);
        expect(newest.map((row) => row.status)).toEqual(["running", "running", "running"]);
        expect(newest[0].durationMs).toBe(7_000);
    });

    it("ends each generated run the way its plan says, unless now or the backend outage cut in", () => {
        const generated = runs.filter((run) => !pinnedIds.has(run.built.runId));
        for (const { built } of generated) {
            const ending = planFor(built.runId, built.startedAt).ending;
            const outage = built.steps.some((step) => step.guard?.reason === OUTAGE_REASON);
            const allowed = outage ? [ending, "running", "blocked"] : [ending, "running"];
            expect(allowed).toContain(built.status);
        }
        expect(generated.filter((run) => run.built.status === "running").length).toBeGreaterThanOrEqual(3);
    });

    it("gives the same runs on every call", () => {
        const again = catalogRuns();
        expect(again.map((run) => run.detail.summary.id)).toEqual(runs.map((run) => run.detail.summary.id));
        expect(catalogRun(runs[5].detail.summary.id)!.detail).toEqual(runs[5].detail);
    });

    it("rows are the summaries of the listed runs", () => {
        expect(rows).toEqual(runs.map((run) => run.detail.summary));
    });

    it("keeps a listed run at its listed start", () => {
        const listed = rows.find((row) => !pinnedIds.has(row.id))!;
        expect(catalogRun(listed.id)!.built.startedAt).toBe(listed.startedAt);
        expect(listed.startedAt).not.toBe(planFromId(listed.id).startedAt);
    });
});

describe("a pinned entry with a bad id", () => {
    it("is left out of the list instead of breaking it", async () => {
        vi.resetModules();
        const registry = await import("./scripts/registry");
        const fresh = await import("./catalog");
        const good = registry.PINNED_RUNS.length;
        registry.PINNED_RUNS.push({ ...registry.PINNED_RUNS[0], id: "not-a-run-id", startedAt: NOW - HOUR });
        let ids: string[];
        try {
            ids = fresh.catalogRuns().map((run) => run.detail.summary.id);
        } finally {
            registry.PINNED_RUNS.pop();
        }
        expect(ids).not.toContain("not-a-run-id");
        expect(ids.filter((id) => pinnedIds.has(id))).toHaveLength(good);
    });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DAY, HOUR, MINUTE, NOW } from "../../rng";
import { runId } from "../../../../../test/data-runs-generate/runs";
import { planFor, planFromId } from "./plan";

const ids = Array.from({ length: 400 }, (_, n) => runId(n + 1));
const ROOTS = ["orchestrator", "support", "inbox-triage", "billing", "deploy-bot"];

describe("planFor", () => {
    it("gives the same plan for the same run id and start", () => {
        expect(planFor(ids[0], NOW - HOUR)).toEqual(planFor(ids[0], NOW - HOUR));
    });

    it("keeps the id and start it was given", () => {
        const plan = planFor(ids[3], NOW - 3 * HOUR);
        expect(plan.id).toBe(ids[3]);
        expect(plan.startedAt).toBe(NOW - 3 * HOUR);
    });

    it("spreads older runs over every root agent", () => {
        const roots = new Set(ids.map((id) => planFor(id, NOW - 2 * HOUR).root));
        expect([...roots].sort()).toEqual([...ROOTS].sort());
    });

    it("starts most runs on the orchestrator and fewest on deploy-bot", () => {
        const roots = ids.map((id) => planFor(id, NOW - 2 * HOUR).root);
        const count = (root: string) => roots.filter((value) => value === root).length;
        for (const root of ROOTS.slice(1)) expect(count("orchestrator")).toBeGreaterThan(count(root));
        for (const root of ROOTS.slice(0, -1)) expect(count("deploy-bot")).toBeLessThan(count(root));
    });

    it("never starts a run on deploy-bot after deploy-runner went offline", () => {
        const recent = ids.map((id) => planFor(id, NOW - 10 * MINUTE).root);
        expect(recent).not.toContain("deploy-bot");
        // The ids that would have gone to deploy-bot go to the orchestrator.
        const moved = ids.filter((id) => planFor(id, NOW - 2 * HOUR).root === "deploy-bot");
        expect(moved.length).toBeGreaterThan(0);
        for (const id of moved) expect(planFor(id, NOW - 10 * MINUTE).root).toBe("orchestrator");
    });

    it("still starts deploy-bot runs just before it went offline", () => {
        const roots = ids.map((id) => planFor(id, NOW - 50 * MINUTE).root);
        expect(roots).toContain("deploy-bot");
    });

    it("ends most runs completed and a few failed or blocked", () => {
        const endings = ids.map((id) => planFor(id, NOW - 2 * HOUR).ending);
        const count = (ending: string) => endings.filter((value) => value === ending).length;
        expect(count("completed")).toBeGreaterThan(count("failed") + count("blocked"));
        expect(count("failed")).toBeGreaterThan(0);
        expect(count("blocked")).toBeGreaterThan(0);
    });

    it("lets only runs older than half an hour ask a human", () => {
        expect(planFor(ids[0], NOW - 30 * MINUTE - 1).canAsk).toBe(true);
        expect(planFor(ids[0], NOW - 30 * MINUTE).canAsk).toBe(false);
        expect(planFor(ids[0], NOW - 5 * MINUTE).canAsk).toBe(false);
    });
});

describe("planFromId", () => {
    it("starts unlisted runs between 7 hours and 23 days ago", () => {
        for (const id of ids) {
            const { startedAt } = planFromId(id);
            expect(startedAt).toBeLessThanOrEqual(NOW - 7 * HOUR);
            expect(startedAt).toBeGreaterThan(NOW - 23 * DAY);
        }
    });

    it("gives each id the same start and plan every time", () => {
        const plan = planFromId(ids[5]);
        expect(planFromId(ids[5])).toEqual(plan);
        expect(plan).toEqual(planFor(ids[5], plan.startedAt));
        expect(plan.canAsk).toBe(true);
    });

    it("gives different ids different starts", () => {
        const starts = new Set(ids.slice(0, 50).map((id) => planFromId(id).startedAt));
        expect(starts.size).toBeGreaterThan(45);
    });
});

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogRunOf, guard, link, model, step } from "../../../../test/data-agents-approvals-fleet/runs";
import { runsPerHour } from "../activity";
import { HOUR, NOW } from "../rng";
import { catalogRuns } from "../runs/catalog";
import { agentNames } from "./roster";
import { fleetSample } from "./sample";
import type { CatalogRun } from "../runs/catalog";

const data = vi.hoisted(() => ({ runs: null as CatalogRun[] | null }));

vi.mock("../runs/catalog", async (importOriginal) => {
    const real = await importOriginal<typeof import("../runs/catalog")>();
    return { ...real, catalogRuns: () => data.runs ?? real.catalogRuns() };
});

afterEach(() => {
    data.runs = null;
});

const perDay = () => runsPerHour().reduce((sum, count) => sum + count, 0);

describe("fleetSample over the listed runs", () => {
    it("samples the runs of the last 6 hours and scales them to a day", () => {
        const sample = fleetSample();
        const recent = catalogRuns().filter((run) => run.detail.summary.startedAt > NOW - 6 * HOUR);

        expect(sample.windowRuns).toBe(recent.length);
        expect(sample.dayScale).toBeCloseTo(perDay() / recent.length, 10);
        expect([...sample.agents.keys()].sort()).toEqual([...agentNames()].sort());
    });

    it("adds every agent's model calls into the fleet total", () => {
        const sample = fleetSample();
        const calls = [...sample.agents.values()].reduce((sum, agent) => sum + agent.modelCalls, 0);

        expect(sample.modelCalls).toBe(calls);
    });

    it("works the sample out once and reuses it", () => {
        expect(fleetSample()).toBe(fleetSample());
    });
});

describe("fleetSample over hand-made runs", () => {
    const at = NOW - HOUR;

    async function sampleOf(runs: CatalogRun[]) {
        data.runs = runs;
        // A fresh module, so the cached sample of other tests is not reused.
        vi.resetModules();
        const fresh = await import("./sample");
        return fresh.fleetSample();
    }

    it("counts runs, model calls, cost and influenced calls per agent", async () => {
        const sample = await sampleOf([
            catalogRunOf(
                "run-a",
                at,
                ["billing"],
                [
                    step({
                        id: "m1",
                        agent: "billing",
                        kind: "model_call",
                        startedAt: at,
                        model: model(0.01),
                        influenced: true,
                    }),
                    step({
                        id: "m2",
                        agent: "billing",
                        kind: "model_call",
                        startedAt: at + 500,
                        durationMs: 900,
                        model: model(0.02),
                    }),
                ],
            ),
        ]);

        expect(sample.windowRuns).toBe(1);
        expect(sample.dayScale).toBe(perDay());
        expect(sample.modelCalls).toBe(2);
        expect(sample.agents.get("billing")).toEqual({
            runs: 1,
            modelCalls: 2,
            costUsd: 0.03,
            asked: 0,
            blocked: 0,
            influencedCalls: 1,
            lastSeenAt: at + 1400,
        });
    });

    it("counts enforced asks and blocks but not observe-mode results", async () => {
        const sample = await sampleOf([
            catalogRunOf(
                "run-a",
                at,
                ["billing"],
                [
                    step({
                        id: "g1",
                        agent: "billing",
                        kind: "guard_decision",
                        startedAt: at,
                        guard: guard({ outcome: "ask" }),
                    }),
                    step({
                        id: "g2",
                        agent: "billing",
                        kind: "guard_decision",
                        startedAt: at,
                        guard: guard({ outcome: "block" }),
                    }),
                    step({
                        id: "g3",
                        agent: "billing",
                        kind: "guard_decision",
                        startedAt: at,
                        guard: guard({ outcome: "block", mode: "observe" }),
                    }),
                    step({
                        id: "g4",
                        agent: "billing",
                        kind: "guard_decision",
                        startedAt: at,
                        guard: guard({ outcome: "allow" }),
                    }),
                ],
            ),
        ]);

        expect(sample.agents.get("billing")).toMatchObject({ asked: 1, blocked: 1 });
    });

    it("ignores steps from agents the run does not list, and runs older than 6 hours", async () => {
        const sample = await sampleOf([
            catalogRunOf(
                "run-a",
                at,
                ["billing"],
                [step({ id: "m1", agent: "researcher", kind: "model_call", startedAt: at, model: model(1) })],
            ),
            catalogRunOf(
                "run-old",
                NOW - 7 * HOUR,
                ["support"],
                [step({ id: "m2", agent: "support", kind: "model_call", startedAt: NOW - 7 * HOUR, model: model(1) })],
            ),
        ]);

        expect([...sample.agents.keys()]).toEqual(["billing"]);
        expect(sample.agents.get("billing")?.lastSeenAt).toBe(0);
        expect(sample.modelCalls).toBe(0);
        expect(sample.windowRuns).toBe(1);
    });

    it("groups links between two agents by kind and counts the untrusted ones", async () => {
        const sample = await sampleOf([
            catalogRunOf(
                "run-a",
                at,
                ["orchestrator", "billing"],
                [
                    step({
                        id: "l1",
                        agent: "orchestrator",
                        kind: "handoff",
                        startedAt: at,
                        link: link({ kind: "delegation", from: "orchestrator", to: "billing", untrusted: true }),
                    }),
                    step({
                        id: "l2",
                        agent: "orchestrator",
                        kind: "handoff",
                        startedAt: at + 2000,
                        link: link({ kind: "handoff", from: "orchestrator", to: "billing" }),
                    }),
                    step({
                        id: "l3",
                        agent: "billing",
                        kind: "message",
                        startedAt: at + 1000,
                        link: link({ kind: "message", from: "billing", to: "orchestrator" }),
                    }),
                ],
            ),
        ]);

        expect(Object.fromEntries(sample.edges)).toEqual({
            "orchestrator>billing": {
                from: "orchestrator",
                to: "billing",
                delegations: 1,
                handoffs: 1,
                messages: 0,
                untrusted: 1,
                lastAt: at + 2000,
            },
            "billing>orchestrator": {
                from: "billing",
                to: "orchestrator",
                delegations: 0,
                handoffs: 0,
                messages: 1,
                untrusted: 0,
                lastAt: at + 1000,
            },
        });
    });

    it("keeps the day scale finite when no run falls in the window", async () => {
        const sample = await sampleOf([]);

        expect(sample).toMatchObject({ windowRuns: 0, dayScale: perDay(), modelCalls: 0 });
        expect(sample.agents.size).toBe(0);
    });
});

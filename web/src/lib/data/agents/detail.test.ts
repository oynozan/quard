// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogRunOf, guard, model, step } from "../../../../test/data-agents-approvals-fleet/runs";
import { modelCallsPer10Min } from "../activity";
import { appOf } from "../guards/apps";
import { NOW } from "../rng";
import { getAgent } from "./detail";
import { agentEdges } from "./graph";
import { fleetSample } from "./sample";
import type { CatalogRun } from "../runs/catalog";

const data = vi.hoisted(() => ({ runs: null as CatalogRun[] | null, noIncidents: false }));

vi.mock("../runs/catalog", async (importOriginal) => {
    const real = await importOriginal<typeof import("../runs/catalog")>();
    return { ...real, catalogRuns: () => data.runs ?? real.catalogRuns() };
});

vi.mock("../incidents/query", async (importOriginal) => {
    const real = await importOriginal<typeof import("../incidents/query")>();
    return { ...real, incidentDetail: (id: string) => (data.noIncidents ? null : real.incidentDetail(id)) };
});

afterEach(() => {
    data.runs = null;
    data.noIncidents = false;
});

// Reads the agent from a fresh module, so its cached fleet sample comes from these runs.
async function billingOver(runs: CatalogRun[]) {
    data.runs = runs;
    vi.resetModules();
    const fresh = await import("./detail");
    return (await fresh.getAgent("billing"))!;
}

describe("getAgent", () => {
    it("gives nothing for an agent that is not on the roster", async () => {
        expect(await getAgent("nobody")).toBeNull();
    });

    it("shows the agent and the app it runs in", async () => {
        const detail = (await getAgent("billing"))!;
        const app = appOf("billing");

        expect(detail.agent).toMatchObject({ name: "billing", version: "v22", state: "running" });
        expect(detail.app).toEqual({
            name: "billing-service",
            rulesHash: app.rulesHash,
            state: "connected",
            lastSeenAt: app.lastSeenAt,
        });
    });

    it("lists versions newest first, each ending when the next began, with their incidents", async () => {
        const versions = (await getAgent("billing"))!.versions;

        expect(versions.map((row) => [row.version, row.current, row.incidents])).toEqual([
            ["v22", true, ["inc_118", "inc_117", "inc_114"]],
            ["v21", false, ["inc_113", "inc_112", "inc_110", "inc_109"]],
            ["v20", false, []],
        ]);
        expect(versions[0].until).toBeNull();
        expect(versions[1].until).toBe(versions[0].since);
        expect(versions[2].until).toBe(versions[1].since);
    });

    it("scales the sampled counts to the last 24 hours", async () => {
        const detail = (await getAgent("billing"))!;
        const sample = fleetSample();
        const own = sample.agents.get("billing")!;

        expect(detail.stats).toEqual({
            runs24h: Math.round(own.runs * sample.dayScale),
            modelCalls24h: Math.round(own.modelCalls * sample.dayScale),
            costUsd24h: Math.round(own.costUsd * sample.dayScale * 100) / 100,
            asked24h: Math.round(own.asked * sample.dayScale),
            blocked24h: Math.round(own.blocked * sample.dayScale),
            influencedShare: Math.round((own.influencedCalls / own.modelCalls) * 1000) / 1000,
        });
    });

    it("gives each of the last 24 hours the agent's share of the fleet's model calls", async () => {
        const activity = (await getAgent("billing"))!.activity;
        const sample = fleetSample();
        const share = sample.agents.get("billing")!.modelCalls / sample.modelCalls;
        const series = modelCallsPer10Min();
        const hourly = Array.from({ length: 24 }, (_, hour) =>
            series.slice(hour * 6, hour * 6 + 6).reduce((sum, value) => sum + value, 0),
        );

        expect(activity).toEqual(hourly.map((calls) => Math.round(calls * share)));
    });

    it("shows no calls in the last hour for an offline agent", async () => {
        const activity = (await getAgent("deploy-bot"))!.activity;

        expect(activity[23]).toBe(0);
        expect(activity[22]).toBeGreaterThan(0);
    });

    it("lists the links to and from the agent, and the incidents that named it", async () => {
        const detail = (await getAgent("billing"))!;

        expect(detail.links).toEqual(agentEdges().filter((edge) => edge.from === "billing" || edge.to === "billing"));
        expect(detail.links.length).toBeGreaterThan(0);
        expect(detail.incidents.find((incident) => incident.id === "inc_114")).toMatchObject({
            title: "Stale price list from a broken tool",
            roles: ["entry", "turning", "damage"],
        });
        expect(detail.incidents.find((incident) => incident.id === "inc_118")?.roles).toEqual(["turning", "damage"]);
    });

    it("keeps the 60 newest calls the agent made itself", async () => {
        const timeline = (await getAgent("billing"))!.timeline;
        const times = timeline.map((call) => call.at);

        expect(timeline).toHaveLength(60);
        expect(times).toEqual([...times].sort((a, b) => b - a));
        expect(timeline.every((call) => call.kind !== "guard_decision")).toBe(true);
    });

    it("shows zero counts, a flat line and no links for an agent with no sampled runs", async () => {
        const detail = await billingOver([]);

        expect(detail.stats).toEqual({
            runs24h: 0,
            modelCalls24h: 0,
            costUsd24h: 0,
            asked24h: 0,
            blocked24h: 0,
            influencedShare: 0,
        });
        expect(detail.activity).toEqual(Array.from({ length: 24 }, () => 0));
        expect(detail.links).toEqual([]);
    });

    it("ties no incidents to the agent when no incident has a verdict", async () => {
        data.noIncidents = true;
        const detail = (await getAgent("billing"))!;

        expect(detail.versions.every((row) => row.incidents.length === 0)).toBe(true);
        expect(detail.incidents).toEqual([]);
    });
});

describe("getAgent timeline over hand-made runs", () => {
    const at = NOW - 60_000;
    const check = (id: string, outcome: "allow" | "ask" | "block", mode: "block" | "observe" = "block") =>
        step({
            id,
            agent: "billing",
            kind: "guard_decision",
            parentId: "t1",
            startedAt: at,
            guard: guard({ outcome, mode }),
        });

    it("gives a tool call the strictest guard result among its checks", async () => {
        const { timeline } = await billingOver([
            catalogRunOf(
                "run-a",
                at,
                ["billing"],
                [
                    step({ id: "t1", agent: "billing", kind: "tool_call", name: "pay_invoice", startedAt: at }),
                    check("c1", "allow"),
                    check("c2", "block", "observe"),
                    check("c3", "ask"),
                    step({
                        id: "m1",
                        agent: "billing",
                        kind: "model_call",
                        name: "gpt-6.1",
                        startedAt: at + 10,
                        model: model(0.004),
                    }),
                ],
            ),
        ]);

        expect(timeline.map((call) => [call.stepId, call.costUsd, call.outcome, call.mode])).toEqual([
            ["m1", 0.004, null, null],
            ["t1", null, "block", "observe"],
        ]);
        expect(timeline[1]).toMatchObject({ runId: "run-a", at, name: "pay_invoice", status: "ok" });
    });

    it("leaves out hosted calls, other agents' calls and runs the agent was not in", async () => {
        const { timeline } = await billingOver([
            catalogRunOf(
                "run-a",
                at,
                ["billing", "researcher"],
                [
                    step({ id: "h1", agent: "billing", kind: "tool_call", startedAt: at, hosted: true }),
                    step({ id: "r1", agent: "researcher", kind: "tool_call", startedAt: at }),
                    step({ id: "w1", agent: "billing", kind: "memory_write", startedAt: at }),
                ],
            ),
            catalogRunOf(
                "run-b",
                at,
                ["support"],
                [step({ id: "s1", agent: "billing", kind: "tool_call", startedAt: at })],
            ),
        ]);

        expect(timeline.map((call) => call.stepId)).toEqual(["w1"]);
    });

    it("stops reading runs once it has twice the calls it shows", async () => {
        const busy = Array.from({ length: 120 }, (_, index) =>
            step({ id: `m${index}`, agent: "billing", kind: "model_call", startedAt: at - index * 1000 }),
        );
        const { timeline } = await billingOver([
            catalogRunOf("run-busy", at, ["billing"], busy),
            catalogRunOf(
                "run-late",
                at,
                ["billing"],
                [step({ id: "late", agent: "billing", kind: "model_call", startedAt: NOW })],
            ),
        ]);

        expect(timeline).toHaveLength(60);
        expect(timeline[0].stepId).toBe("m0");
        expect(timeline.some((call) => call.stepId === "late")).toBe(false);
    });
});

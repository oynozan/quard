// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { appOf } from "../guards/apps";
import { allIncidents } from "../incidents/list";
import { incidentDetail } from "../incidents/query";
import { DAY, NOW } from "../rng";
import { agentEdges, agentNodes, getAgentGraph, incidentRoles } from "./graph";
import { fleetSample, MONTH_DAYS, type FleetSample } from "./sample";

const data = vi.hoisted(() => ({ sample: null as FleetSample | null, noIncidents: false }));

vi.mock("./sample", async (importOriginal) => {
    const real = await importOriginal<typeof import("./sample")>();
    return { ...real, fleetSample: () => data.sample ?? real.fleetSample() };
});

vi.mock("../incidents/query", async (importOriginal) => {
    const real = await importOriginal<typeof import("../incidents/query")>();
    return { ...real, incidentDetail: (id: string) => (data.noIncidents ? null : real.incidentDetail(id)) };
});

afterEach(() => {
    data.sample = null;
    data.noIncidents = false;
});

const emptySample = (): FleetSample => ({
    windowRuns: 0,
    dayScale: 1,
    agents: new Map(),
    edges: new Map(),
    modelCalls: 0,
});

describe("incidentRoles", () => {
    it("names the entry, turning and damage agent from each incident's verdict", () => {
        const roles = incidentRoles();
        const first = allIncidents()[0];
        const verdict = incidentDetail(first.id)!.verdict;

        expect(roles).toHaveLength(allIncidents().length);
        expect(roles[0]).toEqual({
            id: first.id,
            title: first.title,
            openedAt: first.openedAt,
            entry: verdict.entryPoint.agent,
            turning: verdict.turningPoint.agent,
            damage: verdict.damage.agent,
        });
    });

    it("leaves out incidents with no verdict", () => {
        data.noIncidents = true;

        expect(incidentRoles()).toEqual([]);
    });
});

describe("agentEdges", () => {
    it("scales sampled messages to 30 days and puts the busiest link first", () => {
        const edges = agentEdges();
        const sample = fleetSample();
        const scale = sample.dayScale * MONTH_DAYS;
        const sampled = sample.edges.get("orchestrator>billing")!;
        const edge = edges.find((item) => item.from === "orchestrator" && item.to === "billing")!;

        expect(edges).toHaveLength(sample.edges.size);
        expect(edges.map((item) => item.total)).toEqual(edges.map((item) => item.total).sort((a, b) => b - a));
        expect(edge.delegations).toBe(Math.round(sampled.delegations * scale));
        expect(edge.total).toBe(edge.delegations + edge.handoffs + edge.messages);
        expect(edge.lastAt).toBe(sampled.lastAt);
    });

    it("keeps the untrusted share from the sample, to three decimals", () => {
        const edge = agentEdges().find((item) => item.from === "orchestrator" && item.to === "billing")!;
        const sampled = fleetSample().edges.get("orchestrator>billing")!;
        const share = sampled.untrusted / (sampled.delegations + sampled.handoffs + sampled.messages);

        expect(edge.untrustedShare).toBe(Math.round(share * 1000) / 1000);
        expect(edge.untrusted).toBe(Math.round(edge.total * share));
    });

    it("gives a link with nothing sampled an untrusted share of zero", () => {
        data.sample = emptySample();
        data.sample.edges.set("a>b", {
            from: "a",
            to: "b",
            delegations: 0,
            handoffs: 0,
            messages: 0,
            untrusted: 0,
            lastAt: NOW,
        });

        expect(agentEdges()).toEqual([
            {
                from: "a",
                to: "b",
                delegations: 0,
                handoffs: 0,
                messages: 0,
                total: 0,
                untrusted: 0,
                untrustedShare: 0,
                lastAt: NOW,
            },
        ]);
    });
});

describe("agentNodes", () => {
    it("shows each agent's current version, app and run counts", () => {
        const billing = agentNodes().find((node) => node.name === "billing")!;
        const runs24h = Math.round(fleetSample().agents.get("billing")!.runs * fleetSample().dayScale);

        expect(billing).toMatchObject({
            version: "v22",
            model: "gpt-6.1",
            state: "running",
            app: "billing-service",
            runs24h,
            runs30d: Math.round(runs24h * MONTH_DAYS),
        });
    });

    it("counts how often incidents named the agent at each point", () => {
        const roles = incidentRoles();
        const billing = agentNodes().find((node) => node.name === "billing")!;

        expect(billing.entryPoints).toBe(roles.filter((role) => role.entry === "billing").length);
        expect(billing.turningPoints).toBe(roles.filter((role) => role.turning === "billing").length);
        expect(billing.damage).toBe(roles.filter((role) => role.damage === "billing").length);
        expect(billing.damage).toBeGreaterThan(0);
    });

    it("uses the app's last contact for an offline agent and the newest of both for others", () => {
        const nodes = agentNodes();
        const deploy = nodes.find((node) => node.name === "deploy-bot")!;
        const billing = nodes.find((node) => node.name === "billing")!;
        const seen = fleetSample().agents.get("billing")!.lastSeenAt;

        expect(deploy.lastSeenAt).toBe(appOf("deploy-bot").lastSeenAt);
        expect(billing.lastSeenAt).toBe(Math.max(seen, appOf("billing").lastSeenAt));
    });

    it("shows zero runs and the app's last contact for agents missing from the sample", () => {
        data.sample = emptySample();
        const billing = agentNodes().find((node) => node.name === "billing")!;

        expect(billing).toMatchObject({ runs24h: 0, runs30d: 0, lastSeenAt: appOf("billing").lastSeenAt });
    });
});

describe("getAgentGraph", () => {
    it("covers the last 30 days with every agent and link", async () => {
        const graph = await getAgentGraph();

        expect(graph).toMatchObject({ windowDays: 30, startAt: NOW - 30 * DAY, endAt: NOW });
        expect(graph.nodes.map((node) => node.name)).toEqual([
            "orchestrator",
            "researcher",
            "billing",
            "support",
            "inbox-triage",
            "deploy-bot",
        ]);
        expect(graph.edges).toEqual(agentEdges());
    });
});

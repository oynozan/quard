// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RUN_LIMITS } from "../guards/limits";
import { NOW } from "../rng";
import { calls, firstGenerated, runId, STARTED } from "../../../../test/data-runs-generate/runs";
import { RunBuilder, type BuiltRun } from "./build/builder";
import { decisionCounts, rowOf, toDetail } from "./detail";
import type { GuardDecision, Step } from "./types";

const NO_LINKS = { incidentId: null, approvalId: null };

// A model step from a real builder, with the guard result a test needs.
function guarded(outcome: GuardDecision["outcome"] | null, mode: GuardDecision["mode"] = "block"): Step {
    const step = new RunBuilder(runId(1), STARTED).model("billing");
    if (!outcome) return step;
    step.guard = {
        guard: "action",
        tool: "pay_invoice",
        outcome,
        mode,
        rule: "pay_invoice",
        ruleHash: "a1b2c3d4e5f6",
        rulesHash: "f6e5d4c3b2a1",
        reason: "Test decision",
        degraded: false,
        scan: null,
    };
    return step;
}

// An orchestrator run that used two helpers.
function twoHelpers(): BuiltRun {
    return firstGenerated("completed", {}, (run) => run.steps.filter((step) => step.kind === "handoff").length === 2);
}

describe("decisionCounts", () => {
    it("counts enforced blocks and asks, and everything else as allowed", () => {
        const steps = [
            guarded("block"),
            guarded("ask", null),
            guarded("allow"),
            guarded("block", "observe"),
            guarded("ask", "observe"),
            guarded(null),
        ];
        expect(decisionCounts(steps)).toEqual({ allowed: 3, asked: 1, blocked: 1 });
    });

    it("counts nothing for a run without guard decisions", () => {
        expect(decisionCounts([guarded(null)])).toEqual({ allowed: 0, asked: 0, blocked: 0 });
    });
});

describe("toDetail", () => {
    const built = twoHelpers();
    const detail = toDetail(built, { incidentId: "inc_1", approvalId: "apr_1" });
    const agent = (name: string) => detail.agents.find((item) => item.name === name)!;

    it("lists agents in the order they first acted, with their place in the tree", () => {
        expect(detail.agents[0].name).toBe("orchestrator");
        expect(detail.agents[0].parent).toBeNull();
        expect(detail.agents[0].depth).toBe(0);
        for (const helper of detail.agents.slice(1)) {
            expect(helper.parent).toBe("orchestrator");
            expect(helper.depth).toBe(1);
        }
        expect(detail.graph.nodes).toBe(detail.agents);
    });

    it("adds up each agent's steps, model calls and cost", () => {
        const own = built.steps.filter((step) => step.agent === "orchestrator");
        const models = own.filter((step) => step.model);
        const cost = models.reduce((sum, step) => sum + step.model!.costUsd, 0);
        expect(agent("orchestrator").steps).toBe(own.length);
        expect(agent("orchestrator").modelCalls).toBe(models.length);
        expect(agent("orchestrator").costUsd).toBeCloseTo(cost, 4);
        expect(agent("orchestrator").startedAt).toBe(own[0].startedAt);
        expect(agent("orchestrator").endedAt).toBe(Math.max(...own.map((step) => step.startedAt + step.durationMs)));
        expect(detail.agents.reduce((sum, item) => sum + item.steps, 0)).toBe(built.steps.length);
    });

    it("draws an edge for every handoff and message, in time order", () => {
        const linked = built.steps.filter((step) => step.link);
        expect(detail.graph.edges.map((edge) => edge.stepId)).toEqual(linked.map((step) => step.id));
        expect(detail.graph.edges[0]).toMatchObject({ kind: "delegation", from: "orchestrator" });
        expect(detail.graph.edges.some((edge) => edge.kind === "message" && edge.to === "orchestrator")).toBe(true);
    });

    it("measures the run against every run limit", () => {
        const settings = (limit: { name: string; limit: number; unit: string; mode: string }) =>
            [limit.name, limit.limit, limit.unit, limit.mode].join();
        expect(detail.limits.map(settings)).toEqual(RUN_LIMITS.map(settings));
        const used = Object.fromEntries(detail.limits.map((limit) => [limit.name, limit.used]));
        expect(used).toMatchObject({ depth: 1, "fan-out": 2, loops: 1 });
        expect(used.steps).toBe(detail.agents.reduce((sum, item) => sum + item.modelCalls, 0));
        expect(used.cost).toBe(Math.round(detail.summary.costUsd * 100) / 100);
        expect(detail.limits.every((limit) => !limit.over)).toBe(true);
    });

    it("sums the row and keeps the links it was given", () => {
        expect(detail.summary).toMatchObject({
            id: built.runId,
            rootAgent: "orchestrator",
            status: "completed",
            steps: built.steps.length,
            incidentId: "inc_1",
            approvalId: "apr_1",
        });
        const end = Math.max(...built.steps.map((step) => step.startedAt + step.durationMs));
        expect(detail.summary.durationMs).toBe(end - built.startedAt);
        expect(detail.summary.tools).toEqual([...new Set(calls(built).map((call) => call.split(":")[0]))]);
    });

    it("lists each rules hash the guards reported once", () => {
        const hashes = built.steps.flatMap((step) => (step.guard ? [step.guard.rulesHash] : []));
        expect(detail.rulesHashes).toEqual([...new Set(hashes)]);
    });

    it("marks the limit as over when delegation goes deeper than allowed", () => {
        const b = new RunBuilder(runId(2), STARTED);
        const chain = ["orchestrator", "researcher", "billing", "support", "inbox-triage"];
        for (let i = 0; i < chain.length - 1; i++) b.delegate(chain[i], chain[i + 1], { text: "Next" });
        b.model("inbox-triage");
        const deep = toDetail(b.finish(), NO_LINKS);
        const depth = deep.limits.find((limit) => limit.name === "depth")!;
        expect(depth.used).toBe(4);
        expect(depth.over).toBe(true);
        expect(deep.agents.find((item) => item.name === "inbox-triage")?.depth).toBe(4);
    });
});

describe("rowOf", () => {
    it("shows an empty run under a default root with nothing used", () => {
        const empty = new RunBuilder(runId(3), STARTED).finish();
        expect(rowOf(empty, [], NO_LINKS)).toMatchObject({
            rootAgent: "default",
            agents: [],
            steps: 0,
            durationMs: 0,
            costUsd: 0,
            untrusted: false,
            tools: [],
            decisions: { allowed: 0, asked: 0, blocked: 0 },
        });
    });

    it("names the first agent as root when someone else handed it the work", () => {
        const b = new RunBuilder(runId(4), STARTED);
        b.parents.set("support", "inbox-triage");
        b.model("support");
        const run = toDetail(b.finish(), NO_LINKS);
        expect(run.agents[0].parent).toBe("inbox-triage");
        expect(run.summary.rootAgent).toBe("support");
    });

    it("counts a still running run up to now", () => {
        const b = new RunBuilder(runId(5), NOW - 2_000);
        b.model("support", { durationMs: 10_000 });
        const run = toDetail(b.finish(), NO_LINKS);
        expect(run.summary.status).toBe("running");
        expect(run.summary.durationMs).toBe(2_000);
    });

    it("counts a model call without a price as free", () => {
        const b = new RunBuilder(runId(7), STARTED);
        const priced = b.model("support");
        const unpriced = b.model("support");
        // Cast: the type always has a cost, but the sum must not turn into NaN.
        unpriced.model = { ...unpriced.model!, costUsd: undefined as unknown as number };
        const run = toDetail(b.finish(), NO_LINKS);
        expect(run.agents[0].modelCalls).toBe(2);
        expect(run.agents[0].costUsd).toBe(Math.round(priced.model!.costUsd * 10_000) / 10_000);
    });

    it("marks the run untrusted when any step was influenced", () => {
        const built = new RunBuilder(runId(6), STARTED).finish();
        const step = guarded(null);
        step.influenced = true;
        const row = rowOf({ ...built, steps: [step] }, [], NO_LINKS);
        expect(row.untrusted).toBe(true);
    });
});

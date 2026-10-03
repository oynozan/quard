import { versionAt } from "../agents/versions";
import { RUN_LIMITS } from "../guards/limits";
import { NOW } from "../rng";
import type { BuiltRun } from "./build/builder";
import type { DecisionCounts } from "../types";
import type { RunAgent, RunDetail, RunEdge, RunLimitUse, RunRow, Step } from "./types";

export type RunLinks = { incidentId: string | null; approvalId: string | null };

function endOf(step: Step): number {
    return step.startedAt + step.durationMs;
}

function round(value: number, places: number): number {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
}

// Enforced blocks and asks count as such. Observe-mode results let the call run.
export function decisionCounts(steps: Step[]): DecisionCounts {
    const counts: DecisionCounts = { allowed: 0, asked: 0, blocked: 0 };
    for (const step of steps) {
        if (!step.guard) continue;
        const enforced = step.guard.mode !== "observe";
        if (enforced && step.guard.outcome === "block") counts.blocked += 1;
        else if (enforced && step.guard.outcome === "ask") counts.asked += 1;
        else counts.allowed += 1;
    }
    return counts;
}

function agentsOf(built: BuiltRun): RunAgent[] {
    const parents = new Map(built.parents);
    const depth = (agent: string) => {
        let level = 0;
        let parent = parents.get(agent) ?? null;
        while (parent && level < 20) {
            level += 1;
            parent = parents.get(parent) ?? null;
        }
        return level;
    };
    const order: string[] = [];
    for (const step of built.steps) if (!order.includes(step.agent)) order.push(step.agent);
    return order.map((name) => {
        const own = built.steps.filter((step) => step.agent === name);
        const version = versionAt(name, own[0].startedAt);
        const calls = own.filter((step) => step.model);
        return {
            name,
            version: version.version,
            model: version.model,
            parent: parents.get(name) ?? null,
            depth: depth(name),
            tools: version.tools,
            steps: own.length,
            modelCalls: calls.length,
            costUsd: round(
                calls.reduce((sum, step) => sum + (step.model?.costUsd ?? 0), 0),
                4,
            ),
            startedAt: own[0].startedAt,
            endedAt: Math.max(...own.map(endOf)),
            influenced: own.some((step) => step.influenced),
        };
    });
}

function edgesOf(steps: Step[]): RunEdge[] {
    return steps.flatMap((step) =>
        step.link
            ? [
                  {
                      stepId: step.id,
                      kind: step.link.kind,
                      from: step.link.from,
                      to: step.link.to,
                      at: step.startedAt,
                      channel: step.link.channel,
                      carries: step.link.carries,
                      untrusted: step.link.untrusted,
                      summary: step.link.summary,
                  },
              ]
            : [],
    );
}

function limitsOf(agents: RunAgent[], edges: RunEdge[], costUsd: number): RunLimitUse[] {
    const pairs = new Map<string, number>();
    for (const edge of edges) {
        if (edge.kind === "message") continue;
        const key = [edge.from, edge.to].sort().join(">");
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
    const used = {
        depth: Math.max(0, ...agents.map((agent) => agent.depth)),
        "fan-out": Math.max(0, ...agents.map((agent) => agents.filter((a) => a.parent === agent.name).length)),
        loops: Math.max(0, ...pairs.values()),
        steps: agents.reduce((sum, agent) => sum + agent.modelCalls, 0),
        cost: round(costUsd, 2),
    };
    return RUN_LIMITS.map((limit) => ({
        name: limit.name,
        used: used[limit.name],
        limit: limit.limit,
        unit: limit.unit,
        mode: limit.mode,
        over: used[limit.name] > limit.limit,
    }));
}

export function rowOf(built: BuiltRun, agents: RunAgent[], links: RunLinks): RunRow {
    const steps = built.steps;
    const costUsd = agents.reduce((sum, agent) => sum + agent.costUsd, 0);
    const lastEnd = steps.length ? Math.max(...steps.map(endOf)) : built.startedAt;
    const open = built.status === "running" || built.status === "waiting";
    return {
        id: built.runId,
        rootAgent: agents.find((agent) => agent.parent === null)?.name ?? agents[0]?.name ?? "default",
        agents: agents.map((agent) => agent.name),
        status: built.status,
        startedAt: built.startedAt,
        durationMs: (open ? NOW : lastEnd) - built.startedAt,
        steps: steps.length,
        costUsd: round(costUsd, 4),
        decisions: decisionCounts(steps),
        untrusted: steps.some((step) => step.influenced),
        tools: [...new Set(steps.filter((step) => step.kind === "tool_call").map((step) => step.name))],
        incidentId: links.incidentId,
        approvalId: links.approvalId,
    };
}

export function toDetail(built: BuiltRun, links: RunLinks): RunDetail {
    const agents = agentsOf(built);
    const edges = edgesOf(built.steps);
    const summary = rowOf(built, agents, links);
    const rulesHashes = [...new Set(built.steps.flatMap((step) => (step.guard ? [step.guard.rulesHash] : [])))];
    return {
        summary,
        agents,
        graph: { nodes: agents, edges },
        steps: built.steps,
        limits: limitsOf(agents, edges, summary.costUsd),
        rulesHashes,
    };
}

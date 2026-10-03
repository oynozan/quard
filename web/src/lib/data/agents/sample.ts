import { runsPerHour } from "../activity";
import { NOW, HOUR } from "../rng";
import { catalogRuns } from "../runs/catalog";

// Runs in the last 6 hours stand in for the fleet. Counts for longer windows scale from them.
const WINDOW_MS = 6 * HOUR;
// 22 weekdays plus 8 lighter weekend days.
export const MONTH_DAYS = 26.4;

export type AgentSample = {
    runs: number;
    modelCalls: number;
    costUsd: number;
    asked: number;
    blocked: number;
    influencedCalls: number;
    lastSeenAt: number;
};

export type EdgeSample = {
    from: string;
    to: string;
    delegations: number;
    handoffs: number;
    messages: number;
    untrusted: number;
    lastAt: number;
};

export type FleetSample = {
    windowRuns: number;
    // Runs per day divided by runs in the window.
    dayScale: number;
    agents: Map<string, AgentSample>;
    edges: Map<string, EdgeSample>;
    modelCalls: number;
};

let cached: FleetSample | null = null;

export function fleetSample(): FleetSample {
    if (cached) return cached;
    const runs = catalogRuns().filter((run) => run.detail.summary.startedAt > NOW - WINDOW_MS);
    const agents = new Map<string, AgentSample>();
    const edges = new Map<string, EdgeSample>();
    let modelCalls = 0;
    for (const run of runs) {
        for (const name of run.detail.summary.agents) {
            const entry = agents.get(name) ?? {
                runs: 0,
                modelCalls: 0,
                costUsd: 0,
                asked: 0,
                blocked: 0,
                influencedCalls: 0,
                lastSeenAt: 0,
            };
            entry.runs += 1;
            agents.set(name, entry);
        }
        for (const step of run.detail.steps) {
            const entry = agents.get(step.agent);
            if (!entry) continue;
            entry.lastSeenAt = Math.max(entry.lastSeenAt, step.startedAt + step.durationMs);
            if (step.model) {
                modelCalls += 1;
                entry.modelCalls += 1;
                entry.costUsd += step.model.costUsd;
                if (step.influenced) entry.influencedCalls += 1;
            }
            if (step.guard && step.guard.mode !== "observe") {
                if (step.guard.outcome === "ask") entry.asked += 1;
                if (step.guard.outcome === "block") entry.blocked += 1;
            }
            if (step.link) {
                const key = `${step.link.from}>${step.link.to}`;
                const edge = edges.get(key) ?? {
                    from: step.link.from,
                    to: step.link.to,
                    delegations: 0,
                    handoffs: 0,
                    messages: 0,
                    untrusted: 0,
                    lastAt: 0,
                };
                if (step.link.kind === "delegation") edge.delegations += 1;
                else if (step.link.kind === "handoff") edge.handoffs += 1;
                else edge.messages += 1;
                if (step.link.untrusted) edge.untrusted += 1;
                edge.lastAt = Math.max(edge.lastAt, step.startedAt);
                edges.set(key, edge);
            }
        }
    }
    const perDay = runsPerHour().reduce((sum, count) => sum + count, 0);
    cached = { windowRuns: runs.length, dayScale: perDay / Math.max(1, runs.length), agents, edges, modelCalls };
    return cached;
}

import type { RunDetail as StoredRun, RunListItem } from "@quard/db";
import type { ModelUsage, RunAgent, RunDetail, RunRow, Step } from "../types";
import { decisionCounts, statusOf } from "./status";
import { buildSteps } from "./steps";

const ms = (date: Date) => date.getTime();

// The agent whose step started this agent's first model call is its parent
function agentsOf(rootAgent: string, steps: Step[]): RunAgent[] {
    const order = [rootAgent];
    for (const step of steps) if (!order.includes(step.agent)) order.push(step.agent);
    const byId = new Map(steps.map((step) => [step.id, step]));
    const parents = new Map<string, string | null>();
    for (const name of order) {
        const first = steps.find((step) => step.agent === name && step.kind === "model_call" && step.parentId !== null);
        const parent = first?.parentId ? byId.get(first.parentId)?.agent : undefined;
        parents.set(name, parent && parent !== name ? parent : null);
    }
    const depth = (name: string): number => {
        let level = 0;
        for (let parent = parents.get(name); parent && level < 20; parent = parents.get(parent)) level += 1;
        return level;
    };
    return order.map((name) => {
        const own = steps.filter((step) => step.agent === name);
        const models = own.filter((step) => step.kind === "model_call");
        const priced = models.map((step) => step.model).filter((model): model is ModelUsage => model !== null);
        return {
            name,
            version: "",
            model: models.at(-1)?.name ?? "",
            parent: parents.get(name) ?? null,
            depth: depth(name),
            tools: [...new Set(own.filter((step) => step.kind === "tool_call").map((step) => step.name))],
            steps: own.length,
            modelCalls: models.length,
            costUsd: priced.reduce((sum, model) => sum + model.costUsd, 0),
            costKnown: priced.every((model) => model.costKnown !== false),
            startedAt: own[0]?.startedAt ?? 0,
            endedAt: Math.max(0, ...own.map((step) => step.startedAt + step.durationMs)),
            influenced: own.some((step) => step.influenced),
        };
    });
}

// When a run ended: its recorded end, now while it runs, or else its last event
function endOf(run: { endedAt: Date | null; lastEventAt: Date }, running: boolean, now: number): number {
    if (run.endedAt) return ms(run.endedAt);
    return running ? now : ms(run.lastEventAt);
}

// A row of the runs list
export function runRowOf(run: RunListItem, now: number): RunRow {
    const status = statusOf(ms(run.lastEventAt), run.lastStep, now, run.outcome);
    const startedAt = ms(run.startedAt);
    const end = endOf(run, status === "running", now);
    const { allowed, asked, blocked } = run.decisions;
    return {
        id: run.runId,
        rootAgent: run.agent,
        agents: run.agents.length > 0 ? run.agents : [run.agent],
        status,
        startedAt,
        durationMs: Math.max(0, end - startedAt),
        steps: run.modelCalls + run.toolCalls + allowed + asked + blocked,
        costUsd: run.costUsd,
        costKnown: run.costKnown,
        decisions: run.decisions,
        untrusted: run.influenced,
        tools: run.tools,
        incidentId: null,
        approvalId: null,
    };
}

export function runDetailOf(run: StoredRun, now: number): RunDetail {
    const steps = buildSteps(run);
    const agents = agentsOf(run.agent, steps);
    const last = run.steps.at(-1);
    const status = statusOf(
        ms(run.lastEventAt),
        last ? { kind: last.kind, status: last.status } : null,
        now,
        run.outcome,
    );
    const startedAt = ms(run.startedAt);
    const end = endOf(run, status === "running", now);
    const summary: RunRow = {
        id: run.runId,
        rootAgent: run.agent,
        agents: agents.map((agent) => agent.name),
        status,
        startedAt,
        durationMs: Math.max(0, end - startedAt),
        steps: steps.length,
        costUsd: run.costUsd,
        costKnown: run.costKnown,
        decisions: decisionCounts(steps),
        untrusted: steps.some((step) => step.context.trust === "untrusted"),
        tools: [...new Set(run.steps.filter((step) => step.kind === "tool_call").map((step) => step.name))],
        incidentId: null,
        approvalId: null,
    };
    return { summary, agents, graph: { nodes: agents, edges: [] }, steps, limits: [], rulesHashes: [] };
}

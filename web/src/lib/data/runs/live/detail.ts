import type {
    PaymentRow,
    RunDetail as StoredRun,
    RunListItem,
    RunStep,
    RunWaiter,
    RunWarning as StoredWarning,
} from "@quard/db";
import { paymentsOf } from "../../payments/run";
import { stillWaits } from "../../approvals/live/heartbeat";
import type { ModelUsage, RunAgent, RunDetail, RunRow, RunWarning, Step } from "../types";
import { edgesOf } from "./links";
import { decisionCounts, statusOf } from "./status";
import { buildSteps, type StepSource } from "./steps";

const ms = (date: Date) => date.getTime();

// Calls that still beat, and the open request to link, preferring one a call still waits on
function waitingOf(waiters: RunWaiter[], now: number): { live: RunWaiter[]; approvalId: string | null } {
    const live = waiters.filter((waiter) => stillWaits(waiter, now));
    return { live, approvalId: (live[0] ?? waiters[0])?.requestId ?? null };
}

const text = (value: unknown) => (typeof value === "string" ? value : null);

// The agent version each agent's last model call reported
function versionsOf(steps: RunStep[]): Map<string, string> {
    const versions = new Map<string, string>();
    for (const step of steps) {
        const version = text((step.detail as { agentVersion?: unknown } | null)?.agentVersion);
        if (step.kind === "model_call" && version) versions.set(step.agent, version);
    }
    return versions;
}

// The fields of a stored warning event
function warningOf(row: StoredWarning): RunWarning {
    const body = (row.body ?? {}) as { code?: unknown; tool?: unknown; reason?: unknown };
    return {
        agent: row.agent,
        stepId: row.stepId,
        at: ms(row.at),
        code: text(body.code) ?? "",
        tool: text(body.tool),
        reason: text(body.reason),
    };
}

// The agent whose step started this agent's first model call is its parent
function agentsOf(rootAgent: string, steps: Step[], versions: Map<string, string>): RunAgent[] {
    const order = [rootAgent];
    for (const step of steps) if (!order.includes(step.agent)) order.push(step.agent);
    const byId = new Map(steps.map((step) => [step.id, step]));
    const parents = new Map<string, string | null>();
    // The root started the run, so an agent that calls it again does not become its parent
    for (const name of order.slice(1)) {
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
            version: versions.get(name) ?? "",
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

// The recorded end, now while the run is open, else its last event
function endOf(run: { endedAt: Date | null; lastEventAt: Date }, open: boolean, now: number): number {
    if (run.endedAt) return ms(run.endedAt);
    return open ? now : ms(run.lastEventAt);
}

const isOpen = (status: RunRow["status"]) => status === "running" || status === "waiting";

// A row of the runs list, given the run's calls on open approval requests
export function runRowOf(run: RunListItem, now: number, waiters: RunWaiter[] = []): RunRow {
    const { live, approvalId } = waitingOf(waiters, now);
    const status = statusOf(ms(run.lastEventAt), run.lastStep, now, run.outcome, live.length > 0);
    const startedAt = ms(run.startedAt);
    const end = endOf(run, isOpen(status), now);
    const { allowed, asked, blocked } = run.decisions;
    return {
        id: run.runId,
        rootAgent: run.agent,
        agents: run.agents.length > 0 ? run.agents : [run.agent],
        status,
        startedAt,
        durationMs: Math.max(0, end - startedAt),
        // The run view shows each waiting call as a step too
        steps: run.modelCalls + run.toolCalls + allowed + asked + blocked + live.length,
        costUsd: run.costUsd,
        costKnown: run.costKnown,
        spendUsd: run.spendUsd,
        spendKnown: run.spendKnown,
        decisions: run.decisions,
        untrusted: run.influenced,
        tools: run.tools,
        incidentId: null,
        approvalId,
    };
}

export function runDetailOf(
    run: StoredRun & Pick<StepSource, "events">,
    now: number,
    waiters: RunWaiter[] = [],
    payments: PaymentRow[] = [],
): RunDetail {
    const { live, approvalId } = waitingOf(waiters, now);
    const steps = buildSteps(run, live, now);
    const agents = agentsOf(run.agent, steps, versionsOf(run.steps));
    const last = run.steps.at(-1);
    const status = statusOf(
        ms(run.lastEventAt),
        last ? { kind: last.kind, status: last.status } : null,
        now,
        run.outcome,
        live.length > 0,
    );
    const startedAt = ms(run.startedAt);
    const end = endOf(run, isOpen(status), now);
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
        spendUsd: run.spendUsd,
        spendKnown: run.spendKnown,
        decisions: decisionCounts(steps),
        untrusted: steps.some((step) => step.context.trust === "untrusted"),
        tools: [...new Set(run.steps.filter((step) => step.kind === "tool_call").map((step) => step.name))],
        incidentId: null,
        approvalId,
    };
    return {
        summary,
        agents,
        graph: { nodes: agents, edges: edgesOf(steps) },
        steps,
        limits: [],
        payments: paymentsOf(payments),
        warnings: run.warnings.map(warningOf),
    };
}

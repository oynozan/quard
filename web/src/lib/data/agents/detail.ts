import { modelCallsPer10Min } from "../activity";
import { appOf } from "../guards/apps";
import { incidentDetail } from "../incidents/query";
import { allIncidents } from "../incidents/list";
import { catalogRuns } from "../runs/catalog";
import { agentEdges, incidentRoles } from "./graph";
import { AGENTS } from "./roster";
import { fleetSample } from "./sample";
import { versionsOf } from "./versions";
import type { Step } from "../runs/types";
import type { Outcome } from "../types";
import type { AgentCall, AgentDetail, AgentStats, AgentVersionRow } from "./types";

const TIMELINE_LIMIT = 60;
const TIMELINE_KINDS = new Set([
    "model_call",
    "tool_call",
    "handoff",
    "message",
    "approval",
    "memory_read",
    "memory_write",
]);
const STRICTNESS: Record<Outcome, number> = { block: 5, ask: 4, strip: 3, flag: 2, allow: 1, pass: 1 };

function callOf(runId: string, step: Step, steps: Step[]): AgentCall {
    const checks = steps.filter((child) => child.parentId === step.id && child.guard);
    const strictest = checks.sort((a, b) => STRICTNESS[b.guard!.outcome] - STRICTNESS[a.guard!.outcome])[0]?.guard;
    return {
        runId,
        stepId: step.id,
        at: step.startedAt,
        kind: step.kind,
        name: step.name,
        durationMs: step.durationMs,
        status: step.status,
        context: step.context,
        influenced: step.influenced,
        detail: step.detail,
        costUsd: step.model?.costUsd ?? null,
        outcome: strictest?.outcome ?? null,
        mode: strictest?.mode ?? null,
    };
}

// The agent's latest calls across runs, newest first.
function timelineOf(name: string): AgentCall[] {
    const calls: AgentCall[] = [];
    for (const run of catalogRuns()) {
        if (!run.detail.summary.agents.includes(name)) continue;
        for (const step of run.detail.steps) {
            if (step.agent === name && TIMELINE_KINDS.has(step.kind) && !step.hosted) {
                calls.push(callOf(run.detail.summary.id, step, run.detail.steps));
            }
        }
        if (calls.length >= TIMELINE_LIMIT * 2) break;
    }
    return calls.sort((a, b) => b.at - a.at).slice(0, TIMELINE_LIMIT);
}

function versionRows(name: string): AgentVersionRow[] {
    const tied = allIncidents().flatMap((incident) => {
        const detail = incidentDetail(incident.id);
        return detail
            ? detail.verdict.versions.filter((v) => v.agent === name).map((v) => ({ id: incident.id, ...v }))
            : [];
    });
    return versionsOf(name).map((version, index, all) => ({
        version: version.version,
        model: version.model,
        instructionsHash: version.instructionsHash,
        tools: version.tools,
        since: version.since,
        until: index === 0 ? null : all[index - 1].since,
        note: version.note,
        current: index === 0,
        incidents: tied.filter((item) => item.version === version.version).map((item) => item.id),
    }));
}

function statsOf(name: string): AgentStats {
    const sample = fleetSample();
    const own = sample.agents.get(name);
    const scale = sample.dayScale;
    return {
        runs24h: Math.round((own?.runs ?? 0) * scale),
        modelCalls24h: Math.round((own?.modelCalls ?? 0) * scale),
        costUsd24h: Math.round((own?.costUsd ?? 0) * scale * 100) / 100,
        asked24h: Math.round((own?.asked ?? 0) * scale),
        blocked24h: Math.round((own?.blocked ?? 0) * scale),
        influencedShare: own?.modelCalls ? Math.round((own.influencedCalls / own.modelCalls) * 1000) / 1000 : 0,
    };
}

// Model calls per hour, from the fleet's 10-minute series and this agent's share of calls.
function activityOf(name: string): number[] {
    const sample = fleetSample();
    const share = (sample.agents.get(name)?.modelCalls ?? 0) / Math.max(1, sample.modelCalls);
    const series = modelCallsPer10Min();
    return Array.from({ length: 24 }, (_, hour) =>
        Math.round(series.slice(hour * 6, hour * 6 + 6).reduce((sum, value) => sum + value, 0) * share),
    );
}

// One agent: its versions, the last 24 hours, its links and a timeline of its calls.
export async function getAgent(name: string): Promise<AgentDetail | null> {
    const agent = AGENTS.find((item) => item.name === name);
    if (!agent) return null;
    const app = appOf(name);
    return {
        agent,
        app: { name: app.name, rulesHash: app.rulesHash, state: app.state, lastSeenAt: app.lastSeenAt },
        versions: versionRows(name),
        stats: statsOf(name),
        activity:
            agent.state === "offline"
                ? activityOf(name).map((value, hour) => (hour >= 23 ? 0 : value))
                : activityOf(name),
        links: agentEdges().filter((edge) => edge.from === name || edge.to === name),
        incidents: incidentRoles()
            .filter((role) => role.entry === name || role.turning === name || role.damage === name)
            .map((role) => ({
                id: role.id,
                title: role.title,
                openedAt: role.openedAt,
                roles: (["entry", "turning", "damage"] as const).filter((key) => role[key] === name),
            })),
        timeline: timelineOf(name),
    };
}

import { AGENTS } from "./agents";
import { modelCallsPer10Min, runsPerHour, blockRatePerDay, BLOCK_RATE_START } from "./activity";
import { openApprovals } from "./approvals";
import { latestDecisions } from "./events";
import { recentIncidents } from "./incidents";
import { recentRuns } from "./runs";
import { NOW } from "./rng";
import type { Agent, ApprovalRequest, DecisionEvent, GuardCoverage, Incident, RunSummary } from "./types";

export type OverviewData = {
    now: number;
    greeting: string;
    activity: number[];
    runsPerHour: number[];
    coverage: GuardCoverage;
    blockRate: { values: number[]; limit: number; startAt: number };
    decisions24h: { asked: number; blocked: number };
    approvals: ApprovalRequest[];
    runs: RunSummary[];
    incidents: Incident[];
    events: DecisionEvent[];
    agents: Agent[];
    guardCounts: { type: string; count: number }[];
};

function greetingFor(now: number, running: number): string {
    const hour = new Date(now).getUTCHours();
    const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const agents = running === 1 ? "One agent is" : `${running} agents are`;
    return `${part}. ${running === 0 ? "No agents are" : agents} running.`;
}

// Everything the overview page shows. Mock data until the services exist.
export async function getOverview(): Promise<OverviewData> {
    const runs = recentRuns();
    const running = AGENTS.filter((agent) => agent.state === "running").length;
    const asked = runs.reduce((sum, run) => sum + run.decisions.asked, 0);
    const blocked = runs.reduce((sum, run) => sum + run.decisions.blocked, 0);

    return {
        now: NOW,
        greeting: greetingFor(NOW, running),
        activity: modelCallsPer10Min(),
        runsPerHour: runsPerHour(),
        coverage: { guarded: 18, seen: 21 },
        blockRate: { values: blockRatePerDay(), limit: 2, startAt: BLOCK_RATE_START },
        decisions24h: { asked, blocked },
        approvals: openApprovals(),
        runs: runs.slice(0, 6),
        incidents: recentIncidents().slice(0, 4),
        events: latestDecisions(),
        agents: AGENTS,
        guardCounts: [
            { type: "source", count: 2140 },
            { type: "action", count: 612 },
            { type: "egress", count: 344 },
            { type: "limit", count: 1906 },
            { type: "approval", count: 41 },
        ],
    };
}

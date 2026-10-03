import {
    agentRoster,
    blockRateDays,
    decisionTotals,
    guardCounts,
    hasRuns,
    latestDecisions,
    modelCallBuckets,
    runStartBuckets,
    toolCoverage,
} from "@quard/db";
import { decisionLog } from "./overview/decisions";
import { greetingFor } from "./overview/greeting";
import { agentsOf, guardRows, type GuardRow } from "./overview/rail";
import { blockRates, bucketSeries } from "./overview/series";
import { HERO_BUCKETS, RATE_DAYS, RUN_HOURS, windowsAt } from "./overview/windows";
import { projectScope } from "./scope";
import type { Agent, DecisionEvent, GuardCoverage } from "./types";

const LOG_LINES = 12;
// A day above this block rate is worth a review
const REVIEW_RATE = 2;

// Every series is oldest first, and empty when nothing happened in its window
export type OverviewData = {
    greeting: string;
    // Model calls per 10 minutes over the 24 hours before endsAt
    activity: { values: number[]; endsAt: number };
    runsPerHour: number[];
    coverage: GuardCoverage;
    // Percent of guarded tool calls blocked per UTC day from startAt
    blockRate: { values: number[]; limit: number; startAt: number };
    decisions24h: { asked: number; blocked: number };
    events: DecisionEvent[];
    agents: Agent[];
    guardCounts: GuardRow[];
};

// The current project's overview at now, or null before its first run
export async function getOverview(now: number): Promise<OverviewData | null> {
    const scope = await projectScope();
    if (!scope || !(await hasRuns(scope.db, scope.project.id))) return null;
    const { db } = scope;
    const id = scope.project.id;
    const windows = windowsAt(now);
    const [activity, runs, coverage, rates, totals, decisions, roster, guards] = await Promise.all([
        modelCallBuckets(db, id, windows.activity),
        runStartBuckets(db, id, windows.runs),
        toolCoverage(db, id, windows.lastDay),
        blockRateDays(db, id, windows.rateDays),
        decisionTotals(db, id, windows.lastDay),
        latestDecisions(db, id, { ...windows.lastDay, limit: LOG_LINES }),
        agentRoster(db, id, windows.roster),
        guardCounts(db, id, windows.lastDay),
    ]);
    const agents = agentsOf(roster);
    return {
        greeting: greetingFor(now, agents.filter((agent) => agent.state === "running").length),
        activity: { values: bucketSeries(activity, HERO_BUCKETS), endsAt: windows.activity.until.getTime() },
        runsPerHour: bucketSeries(runs, RUN_HOURS),
        coverage,
        blockRate: {
            values: blockRates(rates, RATE_DAYS),
            limit: REVIEW_RATE,
            startAt: windows.rateDays.since.getTime(),
        },
        decisions24h: totals,
        events: decisionLog(decisions),
        agents,
        guardCounts: guardRows(guards),
    };
}

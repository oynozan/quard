import "server-only";
import {
    agentLastSeen,
    agentLinks,
    agentRecentCalls,
    agentRoster,
    agentStats,
    agentVersions,
    modelCallBuckets,
} from "@quard/db";
import { cache } from "react";
import { HOUR } from "@/lib/time";
import { projectScope } from "../scope";
import { timelineOf } from "./live/calls";
import { activityOf, edgeOf, nodeOf, quietNode, statsOf } from "./live/rows";
import { versionsOf } from "./live/versions";
import { hoursWindow, rosterWindow, WINDOW_DAYS } from "./live/windows";
import type { AgentDetail, AgentGraph } from "./types";

// The agent page shows this many of its newest steps
const RECENT_STEPS = 60;

// Templated instructions can make a version per call, so the page lists only the newest
const VERSIONS = 100;

// Every agent heard from in the window, and the delegations between them
export async function getAgentGraph(): Promise<AgentGraph> {
    const scope = await projectScope();
    if (!scope) return { windowDays: WINDOW_DAYS, nodes: [], edges: [] };
    const { db, project } = scope;
    const window = rosterWindow(Date.now());
    const [roster, links] = await Promise.all([
        agentRoster(db, project.id, window),
        agentLinks(db, project.id, { since: window.since }),
    ]);
    return { windowDays: WINDOW_DAYS, nodes: roster.map(nodeOf), edges: links.map(edgeOf) };
}

// Cached per request, since the page and its metadata both ask
export const getAgent = cache(async (name: string): Promise<AgentDetail | null> => {
    const scope = await projectScope();
    if (!scope) return null;
    const { db, project } = scope;
    const lastSeen = await agentLastSeen(db, project.id, name);
    if (!lastSeen) return null;
    const now = Date.now();
    const window = rosterWindow(now);
    const hours = hoursWindow(now);
    const [roster, stats, buckets, groups, links, versions] = await Promise.all([
        agentRoster(db, project.id, window),
        agentStats(db, project.id, name, { since: window.dayAgo }),
        modelCallBuckets(db, project.id, { ...hours, bucketMs: HOUR, agent: name }),
        agentRecentCalls(db, project.id, name, { limit: RECENT_STEPS }),
        agentLinks(db, project.id, { since: window.since, agent: name }),
        // One more than the page lists, for the tools before the oldest one listed
        agentVersions(db, project.id, name, { limit: VERSIONS + 1 }),
    ]);
    const row = roster.find((item) => item.agent === name);
    return {
        agent: row ? nodeOf(row) : quietNode(name, lastSeen),
        stats: statsOf(stats),
        activity: activityOf(buckets, hours.since),
        links: links.map(edgeOf),
        versions: versionsOf(versions, VERSIONS),
        incidents: [],
        timeline: timelineOf(groups),
    };
});

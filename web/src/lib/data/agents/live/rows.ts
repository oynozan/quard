import type { AgentLinkRow, AgentRosterRow, AgentStatsRow, BucketCount } from "@quard/db";
import type { AgentActivity, AgentEdge, AgentNode, AgentStats } from "../types";

export const share = (part: number, whole: number) => Math.round((part / whole) * 1000) / 1000;

export function nodeOf(row: AgentRosterRow): AgentNode {
    return {
        name: row.agent,
        state: row.running ? "running" : "idle",
        model: row.model,
        runs24h: row.runs24h,
        lastSeenAt: row.lastSeenAt.getTime(),
    };
}

// An agent with no event in the roster window is idle, with no model to show
export function quietNode(name: string, lastSeen: Date): AgentNode {
    return { name, state: "idle", model: null, runs24h: 0, lastSeenAt: lastSeen.getTime() };
}

// A link of delegations alone. linksOf adds the handoffs and messages.
export function edgeOf(row: AgentLinkRow): AgentEdge {
    return {
        from: row.from,
        to: row.to,
        delegations: row.delegations,
        handoffs: 0,
        messages: 0,
        total: row.delegations,
        untrusted: row.untrusted,
        untrustedShare: share(row.untrusted, row.delegations),
        lastAt: row.lastAt.getTime(),
    };
}

export function statsOf(row: AgentStatsRow): AgentStats {
    return {
        modelCalls24h: row.modelCalls,
        influencedShare: row.modelCalls > 0 ? share(row.influenced, row.modelCalls) : null,
        costUsd24h: row.costUsd,
        costKnown: row.costKnown,
        asked24h: row.asked,
        blocked24h: row.blocked,
    };
}

// The query leaves out empty hours, so they are filled with 0
export function activityOf(buckets: BucketCount[], since: Date): AgentActivity {
    const perHour = Array.from({ length: 24 }, () => 0);
    for (const { bucket, count } of buckets) perHour[bucket] = count;
    return { startAt: since.getTime(), perHour };
}

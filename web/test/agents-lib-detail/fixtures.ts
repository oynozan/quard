import type { AgentDetail, AgentEdge, AgentNode, AgentVersionRow } from "@/lib/data/agents";
import { DAY, HOUR, NOW } from "../time";

// One link between two agents; every count is zero unless given
export function edge(from: string, to: string, counts: Partial<AgentEdge> = {}): AgentEdge {
    const base = { delegations: 0, handoffs: 0, messages: 0, untrusted: 0, untrustedShare: 0, lastAt: NOW };
    const merged = { ...base, ...counts };
    return { from, to, total: merged.delegations + merged.handoffs + merged.messages, ...merged };
}

export function node(name: string, extra: Partial<AgentNode> = {}): AgentNode {
    return { name, state: "running", model: "claude-sonnet", runs24h: 0, lastSeenAt: NOW, ...extra };
}

export function version(name: string, extra: Partial<AgentVersionRow> = {}): AgentVersionRow {
    return {
        version: name,
        model: "claude-sonnet",
        instructionsHash: "abcdef0123456789abcdef",
        tools: ["search"],
        toolsBefore: null,
        since: NOW - 10 * DAY,
        until: null,
        note: "",
        current: false,
        incidents: [],
        ...extra,
    };
}

// Where the activity window starts at NOW, 24 hours before NOW's hour ends
export const ACTIVITY_START = Date.UTC(2026, 9, 2, 19);

// A quiet page for a running researcher with no calls, links, versions or incidents
export function detail(extra: Partial<AgentDetail> = {}): AgentDetail {
    return {
        agent: node("researcher", { lastSeenAt: NOW - 3 * HOUR }),
        stats: {
            modelCalls24h: 0,
            influencedShare: null,
            costUsd24h: 0,
            costKnown: true,
            asked24h: 0,
            blocked24h: 0,
        },
        activity: { startAt: ACTIVITY_START, perHour: Array.from({ length: 24 }, () => 0) },
        links: [],
        versions: [],
        incidents: [],
        timeline: [],
        ...extra,
    };
}

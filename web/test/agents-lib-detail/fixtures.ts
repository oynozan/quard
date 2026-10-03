import type { AgentDetail, AgentEdge, AgentNode, AgentVersionRow } from "@/lib/data/agents";
import { DAY, NOW } from "@/lib/data/rng";

// One link between two agents; every count is zero unless given
export function edge(from: string, to: string, counts: Partial<AgentEdge> = {}): AgentEdge {
    const base = { delegations: 0, handoffs: 0, messages: 0, untrusted: 0, untrustedShare: 0, lastAt: NOW };
    const merged = { ...base, ...counts };
    return { from, to, total: merged.delegations + merged.handoffs + merged.messages, ...merged };
}

export function node(name: string, extra: Partial<AgentNode> = {}): AgentNode {
    return {
        name,
        version: "v1",
        model: "claude-sonnet",
        tools: [],
        state: "running",
        app: "support-app",
        runs24h: 0,
        runs30d: 0,
        entryPoints: 0,
        turningPoints: 0,
        damage: 0,
        lastSeenAt: NOW,
        ...extra,
    };
}

export function version(name: string, extra: Partial<AgentVersionRow> = {}): AgentVersionRow {
    return {
        version: name,
        model: "claude-sonnet",
        instructionsHash: "abcdef0123456789abcdef",
        tools: ["search"],
        since: NOW - 10 * DAY,
        until: null,
        note: "",
        current: false,
        incidents: [],
        ...extra,
    };
}

// A small agent page: "researcher" in app "support-app", with no links, incidents or calls
export function detail(extra: Partial<AgentDetail> = {}): AgentDetail {
    return {
        agent: { name: "researcher", version: "v3", model: "claude-sonnet", tools: ["search"], state: "running" },
        app: { name: "support-app", rulesHash: "0123456789abcdef0123", state: "connected", lastSeenAt: NOW },
        versions: [],
        stats: { runs24h: 0, modelCalls24h: 0, costUsd24h: 0, asked24h: 0, blocked24h: 0, influencedShare: 0 },
        activity: [],
        links: [],
        incidents: [],
        timeline: [],
        ...extra,
    };
}

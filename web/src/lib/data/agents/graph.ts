import { appOf } from "../guards/apps";
import { allIncidents } from "../incidents/list";
import { incidentDetail } from "../incidents/query";
import { NOW, DAY } from "../rng";
import { AGENT_STATES } from "./roster";
import { fleetSample, MONTH_DAYS } from "./sample";
import { versionsOf } from "./versions";
import type { AgentEdge, AgentGraph, AgentNode } from "./types";

export type IncidentRole = {
    id: string;
    title: string;
    openedAt: number;
    entry: string;
    turning: string;
    damage: string;
};

// Which agents each incident named, from its verdict.
export function incidentRoles(): IncidentRole[] {
    return allIncidents().flatMap((incident) => {
        const detail = incidentDetail(incident.id);
        if (!detail) return [];
        const { entryPoint, turningPoint, damage } = detail.verdict;
        return [
            {
                id: incident.id,
                title: incident.title,
                openedAt: incident.openedAt,
                entry: entryPoint.agent,
                turning: turningPoint.agent,
                damage: damage.agent,
            },
        ];
    });
}

// Agent-to-agent messages over 30 days, scaled from the last 6 hours.
export function agentEdges(): AgentEdge[] {
    const sample = fleetSample();
    const scale = sample.dayScale * MONTH_DAYS;
    return [...sample.edges.values()]
        .map((edge) => {
            const delegations = Math.round(edge.delegations * scale);
            const handoffs = Math.round(edge.handoffs * scale);
            const messages = Math.round(edge.messages * scale);
            const total = delegations + handoffs + messages;
            const sampled = edge.delegations + edge.handoffs + edge.messages;
            const share = sampled ? edge.untrusted / sampled : 0;
            return {
                from: edge.from,
                to: edge.to,
                delegations,
                handoffs,
                messages,
                total,
                untrusted: Math.round(total * share),
                untrustedShare: Math.round(share * 1000) / 1000,
                lastAt: edge.lastAt,
            };
        })
        .sort((a, b) => b.total - a.total);
}

export function agentNodes(): AgentNode[] {
    const sample = fleetSample();
    const roles = incidentRoles();
    return Object.entries(AGENT_STATES).map(([name, state]) => {
        const version = versionsOf(name)[0];
        const stats = sample.agents.get(name);
        const runs24h = Math.round((stats?.runs ?? 0) * sample.dayScale);
        const app = appOf(name);
        return {
            name,
            version: version.version,
            model: version.model,
            tools: version.tools,
            state,
            app: app.name,
            runs24h,
            runs30d: Math.round(runs24h * MONTH_DAYS),
            entryPoints: roles.filter((role) => role.entry === name).length,
            turningPoints: roles.filter((role) => role.turning === name).length,
            damage: roles.filter((role) => role.damage === name).length,
            lastSeenAt: state === "offline" ? app.lastSeenAt : Math.max(stats?.lastSeenAt ?? 0, app.lastSeenAt),
        };
    });
}

export async function getAgentGraph(): Promise<AgentGraph> {
    return { windowDays: 30, startAt: NOW - 30 * DAY, endAt: NOW, nodes: agentNodes(), edges: agentEdges() };
}

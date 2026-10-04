import type { IncidentRow, StoredVerdict } from "@quard/db";
import { originTitle } from "../../approvals/live/influence";
import type { AgentDetail } from "../../agents/types";
import type { Incident, IncidentCategory } from "../../types";
import { replayStatus } from "./replay";

type Found = { tool: string; source: string; agent: string };

// The finder writes no prose, so titles are made from the stored fields
const TITLE: Record<IncidentCategory, (found: Found) => string> = {
    "bad input": ({ tool, source }) => `${tool} with input from ${source}`,
    "bad reasoning": ({ tool, agent }) => `${agent} asked for ${tool} on its own`,
    "bad handoff": ({ tool, source }) => `${tool} after a handoff from ${source}`,
    "broken tool": ({ tool, source }) => `${tool} after ${source} failed`,
    "missing guard": ({ tool }) => `${tool} with no guard to stop it`,
};

// What happened at the damage. Verdicts stored before kind name a tool call.
function damageOf({ tool, ran, kind }: StoredVerdict["damage"]): string {
    if (kind === "detection") return `Content from ${tool} was flagged`;
    if (kind === "limit") return ran ? `${tool} went over a run limit` : `A run limit stopped ${tool}`;
    return `${tool} ${ran ? "ran" : "was blocked"}`;
}

// Content a guard flagged, or a run limit, reads the same in every category
function titleOf(verdict: StoredVerdict, found: Found): string {
    const { kind } = verdict.damage;
    if (kind === "detection") return `${found.tool} returned flagged content from ${found.source}`;
    if (kind === "limit") return damageOf(verdict.damage);
    return TITLE[verdict.category](found);
}

// An incident as the lists show it. Until the verdict is found, the title says where the finder is.
export function incidentOf(row: IncidentRow): Incident {
    const base = { id: row.id, runId: row.runId, replay: replayStatus(row), openedAt: row.openedAt.getTime() };
    const verdict = row.verdict;
    if (!verdict) {
        const title = row.findState === "failed" ? "Root cause not found" : "Finding the root cause";
        return { ...base, title, category: null, entryPoint: null, damage: null, entryAgent: null, damageAgent: null };
    }
    const { entry, turning, damage } = verdict;
    const found = { tool: damage.tool, source: originTitle(entry.origin), agent: turning.agent };
    return {
        ...base,
        title: titleOf(verdict, found),
        category: verdict.category,
        entryPoint: entry.origin,
        damage: damageOf(damage),
        entryAgent: entry.agent,
        damageAgent: damage.agent,
    };
}

const ROLES = ["entry", "turning", "damage"] as const;

// An incident on the agent page, with the parts this agent played in it
export function agentIncidentOf(row: IncidentRow, agent: string): AgentDetail["incidents"][number] {
    return {
        id: row.id,
        title: incidentOf(row).title,
        roles: ROLES.filter((role) => row[`${role}Agent`] === agent),
        openedAt: row.openedAt.getTime(),
    };
}

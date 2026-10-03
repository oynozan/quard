import type { AgentRosterRow, GuardCount } from "@quard/db";
import type { Agent } from "../types";

export type GuardRow = { type: string; count: number };

// Guards the rail always lists in this order, before any others
const ORDER = ["source", "action", "egress", "limit", "approval", "permission", "signature"];

const rank = (guard: string) => {
    const index = ORDER.indexOf(guard);
    return index === -1 ? ORDER.length : index;
};

// Running agents first, each group by name
export function agentsOf(rows: AgentRosterRow[]): Agent[] {
    const agents = rows.map((row): Agent => ({
        name: row.agent,
        state: row.running ? "running" : "idle",
        model: row.model,
    }));
    return [
        ...agents.filter((agent) => agent.state === "running"),
        ...agents.filter((agent) => agent.state === "idle"),
    ];
}

// Others keep the database order, the most decisions first
export function guardRows(counts: GuardCount[]): GuardRow[] {
    return [...counts]
        .sort((a, b) => rank(a.guard) - rank(b.guard))
        .map((row) => ({ type: row.guard, count: row.count }));
}

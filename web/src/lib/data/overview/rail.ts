import type { AgentRosterRow, GuardCount } from "@quard/db";
import type { Agent } from "../types";

export type GuardRow = { type: string; count: number };

// Guards the rail always lists in this order, before any others
const ORDER = ["source", "action", "egress", "limit", "approval", "permission", "signature"];

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

// Known guards at 0 when they decided nothing, then others in the database order, the most first
export function guardRows(counts: GuardCount[]): GuardRow[] {
    const countOf = (guard: string) => counts.find((row) => row.guard === guard)?.count ?? 0;
    const others = counts.filter((row) => !ORDER.includes(row.guard));
    return [
        ...ORDER.map((type) => ({ type, count: countOf(type) })),
        ...others.map((row) => ({ type: row.guard, count: row.count })),
    ];
}

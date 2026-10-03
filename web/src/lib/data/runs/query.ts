import { catalogRows, catalogRun } from "./catalog";
import type { RunDetail, RunQuery, RunRow } from "./types";

// Every word must match the id, an agent, a tool, the status or a linked incident or approval.
function matches(row: RunRow, query: string): boolean {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const fields = [
        row.status,
        ...row.agents,
        ...row.tools,
        ...(row.incidentId ? [row.incidentId] : []),
        ...(row.approvalId ? [row.approvalId] : []),
    ].map((field) => field.toLowerCase());
    return words.every((word) => row.id.startsWith(word) || fields.some((field) => field.includes(word)));
}

// Runs newest first, filtered. The list holds the last 6 hours plus older runs that
// an incident or approval points at.
export async function listRuns(filter: RunQuery = {}): Promise<RunRow[]> {
    const rows = catalogRows().filter(
        (row) =>
            (!filter.agent || row.agents.includes(filter.agent)) &&
            (!filter.status || row.status === filter.status) &&
            (!filter.query || matches(row, filter.query)),
    );
    return filter.limit ? rows.slice(0, filter.limit) : rows;
}

// One run with its agents, graph, limits and time-ordered steps.
// Any 32-hex id works: unknown ids are generated from the id. Anything else gives null.
export async function getRun(runId: string): Promise<RunDetail | null> {
    return catalogRun(runId)?.detail ?? null;
}

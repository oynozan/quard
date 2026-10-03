import { getRun as storedRun, listRuns as storedRuns } from "@quard/db";
import { projectScope } from "../scope";
import { runDetailOf, runRowOf } from "./live/detail";
import type { RunDetail, RunQuery, RunRow } from "./types";

// The newest runs the list filters over
const WINDOW = 200;

// Every word must match the id, an agent, a tool or the status.
// Incident and approval links join the search once they exist (M3, M5).
function matches(row: RunRow, query: string): boolean {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const fields = [row.status, ...row.agents, ...row.tools].map((field) => field.toLowerCase());
    return words.every((word) => row.id.startsWith(word) || fields.some((field) => field.includes(word)));
}

// Runs from Postgres, newest first, filtered
export async function listRuns(filter: RunQuery = {}): Promise<RunRow[]> {
    const scope = await projectScope();
    if (!scope) return [];
    const now = Date.now();
    const rows = (await storedRuns(scope.db, scope.project.id, { limit: WINDOW }))
        .map((run) => runRowOf(run, now))
        .filter(
            (row) =>
                (!filter.agent || row.agents.includes(filter.agent)) &&
                (!filter.status || row.status === filter.status) &&
                (!filter.query || matches(row, filter.query)),
        );
    return filter.limit ? rows.slice(0, filter.limit) : rows;
}

// One run with its agents and time-ordered steps, or null when the project has no such run
export async function getRun(runId: string): Promise<RunDetail | null> {
    const scope = await projectScope();
    if (!scope) return null;
    const run = await storedRun(scope.db, scope.project.id, runId);
    return run ? runDetailOf(run, Date.now()) : null;
}

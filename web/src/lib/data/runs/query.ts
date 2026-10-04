import { getRun as storedRun, incidentsForRuns, listRuns as storedRuns, runPayments, runWaiters } from "@quard/db";
import { APPROVAL_STALE_MS } from "@quard/shared";
import { projectScope } from "../scope";
import { runDetailOf } from "./live/detail";
import { runRowsOf } from "./live/rows";
import type { RunDetail, RunQuery, RunRow } from "./types";

// How many runs the list reads at most
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
    const runs = await storedRuns(scope.db, scope.project.id, {
        limit: WINDOW,
        // In SQL, so newer runs cannot push an agent's runs out of the window
        agent: filter.agent || undefined,
        // Approvals never expire, so a run that waits is found however old it is
        beatSince: filter.status === "waiting" ? new Date(now - APPROVAL_STALE_MS) : undefined,
    });
    const rows = (await runRowsOf(scope.db, scope.project.id, runs, now)).filter(
        (row) => (!filter.status || row.status === filter.status) && (!filter.query || matches(row, filter.query)),
    );
    return filter.limit ? rows.slice(0, filter.limit) : rows;
}

// One run with its agents and time-ordered steps, or null when the project has no such run
export async function getRun(runId: string): Promise<RunDetail | null> {
    const scope = await projectScope();
    if (!scope) return null;
    const { db, project } = scope;
    const [run, incidents, waiters, payments] = await Promise.all([
        storedRun(db, project.id, runId),
        incidentsForRuns(db, project.id, [runId]),
        runWaiters(db, project.id, [runId]),
        runPayments(db, project.id, runId),
    ]);
    if (!run) return null;
    const detail = runDetailOf(run, Date.now(), waiters, payments);
    return { ...detail, summary: { ...detail.summary, incidentId: incidents[0]?.id ?? null } };
}

import { getRun as storedRun, listRuns as storedRuns } from "@quard/db";
import { connection } from "next/server";
import { database } from "./live/client";
import { runDetailOf, runRowOf } from "./live/detail";
import { currentProject } from "./live/project";
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

// Reads are per request, so nothing is cached at build time
async function project() {
    await connection();
    const db = database();
    return { db, project: await currentProject(db) };
}

// The time of this request, for ages and running durations
export async function requestTime(): Promise<number> {
    await connection();
    return Date.now();
}

// Runs from Postgres, newest first, filtered
export async function listRuns(filter: RunQuery = {}): Promise<RunRow[]> {
    const { db, project: current } = await project();
    if (!current) return [];
    const now = Date.now();
    const rows = (await storedRuns(db, current.id, { limit: WINDOW }))
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
    const { db, project: current } = await project();
    if (!current) return null;
    const run = await storedRun(db, current.id, runId);
    return run ? runDetailOf(run, Date.now()) : null;
}

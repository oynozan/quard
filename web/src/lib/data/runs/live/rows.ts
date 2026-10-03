import { runWaiters, type Db, type RunListItem } from "@quard/db";
import type { RunRow } from "../types";
import { runRowOf } from "./detail";

// List rows for stored runs, with one lookup for the calls that wait for a person
export async function runRowsOf(db: Db, projectId: string, runs: RunListItem[], now: number): Promise<RunRow[]> {
    const ids = runs.map((run) => run.runId);
    const waiters = await runWaiters(db, projectId, ids);
    const waitersOf = (runId: string) => waiters.filter((waiter) => waiter.runId === runId);
    return runs.map((run) => runRowOf(run, now, waitersOf(run.runId)));
}

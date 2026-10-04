import "server-only";
import { getIncident as storedIncident, getRun, listIncidents as storedIncidents } from "@quard/db";
import { cache } from "react";
import { runDetailOf } from "../runs/live/detail";
import { projectScope } from "../scope";
import type { Incident } from "../types";
import { incidentDetailOf } from "./live/detail";
import { incidentOf } from "./live/incident";
import type { IncidentDetail } from "./types";

// ponytail: the list holds the newest 200; page through them when a project opens more
const WINDOW = 200;

// The newest incidents first
export async function listIncidents(limit = WINDOW): Promise<Incident[]> {
    const scope = await projectScope();
    if (!scope) return [];
    return (await storedIncidents(scope.db, scope.project.id, { limit })).map(incidentOf);
}

// Cached per request, since the page and its metadata both ask
export const getIncident = cache(async (id: string): Promise<IncidentDetail | null> => {
    const scope = await projectScope();
    if (!scope) return null;
    const { db, project } = scope;
    const row = await storedIncident(db, project.id, id);
    if (!row) return null;
    // The incident row references its run, so the run is always there
    const run = (await getRun(db, project.id, row.runId))!;
    return incidentDetailOf(row, runDetailOf(run, Date.now()));
});

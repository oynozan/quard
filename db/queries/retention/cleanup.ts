import type { Db } from "../../connect/connect.ts";
import type { Stopped } from "./batch.ts";
import {
    deleteConnections,
    deleteDayCounters,
    deleteFleetUses,
    deleteFleetValues,
    deleteRevokedGrants,
} from "./control.ts";
import { daysAgo } from "./policy.ts";
import { deleteExpiredRuns, deleteMessageRecords, deleteOrphanApprovals, deleteRunCounters } from "./runs.ts";
import type { Sweep } from "./sweep.ts";

// Rows deleted, by kind. Memory labels are never deleted.
export type CleanupCounts = {
    runs: number;
    approvals: number;
    messageRecords: number;
    runCounters: number;
    dayCounters: number;
    fleetUses: number;
    fleetValues: number;
    connections: number;
    grants: number;
};

export type CleanupResult = { projects: number; deleted: CleanupCounts };

export type CleanupOptions = { now?: Date; stopped?: Stopped };

// In order: approvals look for runs that are gone
const STEPS: [keyof CleanupCounts, (sweep: Sweep) => Promise<number>][] = [
    ["runs", deleteExpiredRuns],
    ["approvals", deleteOrphanApprovals],
    ["messageRecords", deleteMessageRecords],
    ["runCounters", deleteRunCounters],
    ["dayCounters", deleteDayCounters],
    ["fleetUses", deleteFleetUses],
    ["fleetValues", deleteFleetValues],
    ["connections", deleteConnections],
    ["grants", deleteRevokedGrants],
];

export function noneDeleted(): CleanupCounts {
    return Object.fromEntries(STEPS.map(([kind]) => [kind, 0])) as CleanupCounts;
}

// Deletes one project's expired data, keeping runs for its own days
export async function cleanProject(
    db: Db,
    project: { id: string; retentionDays: number },
    { now = new Date(), stopped = () => false }: CleanupOptions = {},
): Promise<CleanupCounts> {
    const sweep = { db, projectId: project.id, now, runCutoff: daysAgo(now, project.retentionDays), stopped };
    const counts = noneDeleted();
    for (const [kind, step] of STEPS) {
        counts[kind] = await step(sweep);
    }
    return counts;
}

// Deletes expired data in every project, one project at a time
export async function cleanExpired(db: Db, options: CleanupOptions = {}): Promise<CleanupResult> {
    const projects = await db
        .selectFrom("projects")
        .select(["id", "retention_days as retentionDays"])
        .orderBy("created_at")
        .orderBy("id")
        .execute();
    const deleted = noneDeleted();
    for (const project of projects) {
        const counts = await cleanProject(db, project, options);
        for (const [kind] of STEPS) {
            deleted[kind] += counts[kind];
        }
    }
    return { projects: projects.length, deleted };
}

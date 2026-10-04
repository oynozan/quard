import { sql, type RawBuilder } from "kysely";
import { daysAgo, BATCH, RETENTION } from "./policy.ts";
import { deleteWhere, type Sweep } from "./sweep.ts";

// A run past its days is still kept while any of these holds for it (`x`).
// Content labels add theirs here: runs with reviewed chunks stay a year.
export function runKeepers(sweep: Sweep): RawBuilder<boolean>[] {
    const incidentCutoff = daysAgo(sweep.now, RETENTION.incidentDays);
    return [
        // Verdicts and replay keep working for a year, and a job in progress finishes
        sql<boolean>`EXISTS (SELECT 1 FROM incidents i WHERE i.project_id = x.project_id
            AND i.run_id = x.run_id AND (i.opened_at >= ${incidentCutoff} OR i.leased_until > ${sweep.now}))`,
        // A person reviewed its content labels, which tune the detector for a year
        sql<boolean>`EXISTS (SELECT 1 FROM chunk_labels c WHERE c.project_id = x.project_id
            AND c.run_id = x.run_id AND c.reviewed_at >= ${incidentCutoff})`,
    ];
}

// Deletes runs past the project's days. Steps, events, labels, decisions,
// payments, agent messages and the incident go with each run.
export function deleteExpiredRuns(sweep: Sweep): Promise<number> {
    const kept = sql.join(runKeepers(sweep), sql` OR `);
    const expired = sql<boolean>`x.started_at < ${sweep.runCutoff}
        AND x.last_event_at < ${sweep.runCutoff} AND NOT (${kept})`;
    return deleteWhere(sweep, "runs", "project_id, run_id", expired, BATCH.runs);
}

// Approval requests whose run is gone, with their waiters. Open ones go
// too: no call still waits on a request this old.
export function deleteOrphanApprovals(sweep: Sweep): Promise<number> {
    const orphan = sql<boolean>`x.opened_at < ${sweep.runCutoff} AND NOT EXISTS (SELECT 1 FROM runs r
        WHERE r.project_id = x.project_id AND r.run_id = x.run_id)`;
    return deleteWhere(sweep, "approval_requests", "project_id, id", orphan);
}

// Message records only serve lookups while the run is live
export function deleteMessageRecords(sweep: Sweep): Promise<number> {
    const old = sql<boolean>`x.stored_at < ${sweep.runCutoff}`;
    return deleteWhere(sweep, "message_records", "project_id, ref", old);
}

// Counters of runs that spanned processes
export function deleteRunCounters(sweep: Sweep): Promise<number> {
    const old = sql<boolean>`x.updated_at < ${sweep.runCutoff}`;
    return deleteWhere(sweep, "run_counters", "project_id, run_id, counter", old);
}

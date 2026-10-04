import { sql } from "kysely";
import { daysAgo, RETENTION } from "./policy.ts";
import { deleteWhere, type Sweep } from "./sweep.ts";

// Per-day limit counters a few days after their day
export function deleteDayCounters(sweep: Sweep): Promise<number> {
    const day = daysAgo(sweep.now, RETENTION.dayCounterDays).toISOString().slice(0, 10);
    const old = sql<boolean>`x.day < ${day}::date`;
    return deleteWhere(sweep, "day_counters", "project_id, day, tool, counter", old);
}

// Old uses of watched values. The newest use of each value stays, so the
// value's last use is known, and so do the uses of a quarantined value,
// which the dashboard counts.
export function deleteFleetUses(sweep: Sweep): Promise<number> {
    const old = sql<boolean>`x.at < ${sweep.runCutoff}
        AND NOT EXISTS (SELECT 1 FROM fleet_values v WHERE v.project_id = x.project_id
            AND v.key = x.key AND v.quarantined_at IS NOT NULL)
        AND EXISTS (SELECT 1 FROM fleet_uses n WHERE n.project_id = x.project_id
            AND n.key = x.key AND n.id > x.id)`;
    return deleteWhere(sweep, "fleet_uses", "id", old);
}

// Values the fleet check has not seen for a year. Until then, an old value
// never looks new again. Quarantined values wait for a person.
export function deleteFleetValues(sweep: Sweep): Promise<number> {
    const cutoff = daysAgo(sweep.now, RETENTION.fleetDays);
    const unused = sql<boolean>`x.first_seen_at < ${cutoff} AND x.quarantined_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM fleet_uses u WHERE u.project_id = x.project_id
            AND u.key = x.key AND u.at >= ${cutoff})`;
    return deleteWhere(sweep, "fleet_values", "project_id, key", unused);
}

// Closed SDK connections, once the settings page no longer lists them
export function deleteConnections(sweep: Sweep): Promise<number> {
    const old = sql<boolean>`x.disconnected_at < ${daysAgo(sweep.now, RETENTION.connectionDays)}`;
    return deleteWhere(sweep, "sdk_connections", "project_id, id", old);
}

// "Always approve" decisions revoked longer ago than the project's days
export function deleteRevokedGrants(sweep: Sweep): Promise<number> {
    const old = sql<boolean>`x.revoked_at < ${sweep.runCutoff}`;
    return deleteWhere(sweep, "approval_grants", "project_id, id", old);
}

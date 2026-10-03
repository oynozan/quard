import { FLEET_CHECK } from "@quard/shared";
import { sql } from "kysely";
import type { Db } from "../../../connect/connect.ts";
import { splitFleetKey } from "./keys.ts";
import { daysBefore, hoursBefore } from "./window.ts";

type FleetKind = "iban" | "email" | "domain";

export type QuarantinedFleetItem = {
    kind: FleetKind;
    // The field the value was first seen in
    field: string;
    key: string;
    // The mask, or the domain itself
    value: string;
    // Null for domains, which are kept in clear
    hash: string | null;
    firstSeenAt: Date;
    quarantinedAt: Date;
    // Quarantined while the check only observed
    observe: boolean;
    // Separate runs that used it, ever
    runs: number;
    blockedAttempts: number;
    agents: string[];
    lastAttemptAt: Date | null;
};

// A new value the check is counting, not yet quarantined
export type WatchedFleetItem = {
    kind: FleetKind;
    field: string;
    key: string;
    value: string;
    hash: string | null;
    firstSeenAt: Date;
    // Separate runs in the window that counts; at the limit it is quarantined
    runs: number;
    agents: string[];
    lastSeenAt: Date | null;
};

const USES = sql.raw("u.project_id = v.project_id AND u.key = v.key");
const agents = sql<string[]>`array(SELECT DISTINCT u.agent FROM fleet_uses u WHERE ${USES} ORDER BY u.agent)`;
const lastUse = sql<Date | null>`(SELECT max(u.at) FROM fleet_uses u WHERE ${USES})`;

// Quarantined values, newest first
export async function listQuarantined(db: Db, projectId: string): Promise<QuarantinedFleetItem[]> {
    const rows = await db
        .selectFrom("fleet_values as v")
        .select([
            "v.kind",
            "v.field",
            "v.key",
            "v.first_seen_at as firstSeenAt",
            "v.quarantined_at as quarantinedAt",
            "v.observe",
            sql<number>`(SELECT count(DISTINCT u.run_id)::int FROM fleet_uses u WHERE ${USES})`.as("runs"),
            sql<number>`(SELECT count(*)::int FROM fleet_uses u WHERE ${USES} AND u.blocked)`.as("blockedAttempts"),
            agents.as("agents"),
            lastUse.as("lastAttemptAt"),
        ])
        .$narrowType<{ quarantinedAt: Date }>()
        .where("v.project_id", "=", projectId)
        .where("v.quarantined_at", "is not", null)
        .orderBy("v.quarantined_at", "desc")
        .orderBy("v.key")
        .execute();
    return rows.map((row) => ({ ...row, ...splitFleetKey(row.key) }));
}

// New values that are neither quarantined nor known, busiest first
export async function listWatched(db: Db, projectId: string, now = new Date()): Promise<WatchedFleetItem[]> {
    const since = hoursBefore(now, FLEET_CHECK.withinHours);
    const rows = await db
        .selectFrom("fleet_values as v")
        .select([
            "v.kind",
            "v.field",
            "v.key",
            "v.first_seen_at as firstSeenAt",
            sql<number>`(SELECT count(DISTINCT u.run_id)::int FROM fleet_uses u WHERE ${USES} AND u.at > ${since})`.as(
                "runs",
            ),
            agents.as("agents"),
            lastUse.as("lastSeenAt"),
        ])
        .where("v.project_id", "=", projectId)
        .where("v.quarantined_at", "is", null)
        .where("v.known_at", "is", null)
        .where("v.first_seen_at", ">", daysBefore(now, FLEET_CHECK.newForDays))
        .orderBy("runs", "desc")
        .orderBy("v.first_seen_at", "desc")
        .orderBy("v.key")
        .execute();
    return rows.map((row) => ({ ...row, ...splitFleetKey(row.key) }));
}

// The fields the check has seen values in
export async function fleetFields(db: Db, projectId: string): Promise<string[]> {
    const rows = await db
        .selectFrom("fleet_values")
        .select("field")
        .distinct()
        .where("project_id", "=", projectId)
        .orderBy("field")
        .execute();
    return rows.map((row) => row.field);
}

import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { TimeRange } from "../activity.ts";

// A payee first paid within the window, with what it was paid there
export type NewPayee = {
    payTo: string;
    // The network of its first payment
    network: string;
    firstPaidAt: Date;
    usd: number;
    payments: number;
    unknown: number;
    runs: number;
    agents: string[];
};

// A wallet the fleet check quarantined, with what it was paid before
export type QuarantinedPayee = {
    address: string;
    field: string;
    firstSeenAt: Date;
    quarantinedAt: Date;
    // Quarantined while the check only observed
    observe: boolean;
    runs: number;
    blockedAttempts: number;
    usd: number;
    payments: number;
};

// Payees whose first settled payment falls in the window, newest first
export async function newPayees(db: Db, projectId: string, range: TimeRange): Promise<NewPayee[]> {
    return db
        .selectFrom("payments")
        .select([
            "pay_to as payTo",
            sql<string>`(array_agg(network ORDER BY at, event_id))[1]`.as("network"),
            sql<Date>`min(at)`.as("firstPaidAt"),
            sql<number>`coalesce(sum(usd), 0)::float8`.as("usd"),
            sql<number>`count(*)::int`.as("payments"),
            sql<number>`(count(*) FILTER (WHERE usd IS NULL))::int`.as("unknown"),
            sql<number>`count(DISTINCT run_id)::int`.as("runs"),
            sql<string[]>`array_agg(DISTINCT agent ORDER BY agent)`.as("agents"),
        ])
        .where("project_id", "=", projectId)
        .where("stage", "=", "settled")
        .where("at", "<", range.until)
        .groupBy("pay_to")
        .having(sql<Date>`min(at)`, ">=", range.since)
        .orderBy("firstPaidAt", "desc")
        .orderBy("payTo")
        .execute();
}

const USES = sql.raw("u.project_id = v.project_id AND u.key = v.key");
// EVM addresses differ only in their checksum case; others are case-sensitive
const PAID = sql.raw(
    "p.project_id = v.project_id AND p.stage = 'settled' AND (p.pay_to = substr(v.key, 8) " +
        "OR (p.pay_to ILIKE '0x%' AND lower(p.pay_to) = lower(substr(v.key, 8))))",
);

// Wallets the fleet check quarantined, newest first
export async function quarantinedPayees(db: Db, projectId: string): Promise<QuarantinedPayee[]> {
    return db
        .selectFrom("fleet_values as v")
        .select([
            sql<string>`substr(v.key, 8)`.as("address"),
            "v.field",
            "v.first_seen_at as firstSeenAt",
            "v.quarantined_at as quarantinedAt",
            "v.observe",
            sql<number>`(SELECT count(DISTINCT u.run_id)::int FROM fleet_uses u WHERE ${USES})`.as("runs"),
            sql<number>`(SELECT count(*)::int FROM fleet_uses u WHERE ${USES} AND u.blocked)`.as("blockedAttempts"),
            sql<number>`(SELECT coalesce(sum(p.usd), 0)::float8 FROM payments p WHERE ${PAID})`.as("usd"),
            sql<number>`(SELECT count(*)::int FROM payments p WHERE ${PAID})`.as("payments"),
        ])
        .$narrowType<{ quarantinedAt: Date }>()
        .where("v.project_id", "=", projectId)
        .where("v.kind", "=", "wallet")
        .where("v.quarantined_at", "is not", null)
        .orderBy("v.quarantined_at", "desc")
        .orderBy("v.key")
        .execute();
}

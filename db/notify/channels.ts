import { sql } from "kysely";
import type { Db } from "../connect/connect.ts";

// Postgres channels that tell control about changes made elsewhere: the
// payload is a request id, a project id or an agent key id. quard_live
// tells the dashboard that a project's runs or approvals changed, as JSON.
export const CHANNELS = {
    approvals: "quard_approvals",
    fleet: "quard_fleet",
    keys: "quard_keys",
    live: "quard_live",
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

// Inside a transaction, Postgres sends it only when the transaction commits
export async function notify(db: Db, channel: Channel, payload: string): Promise<void> {
    await sql`SELECT pg_notify(${channel}, ${payload})`.execute(db);
}

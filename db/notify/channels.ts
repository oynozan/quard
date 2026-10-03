import { sql } from "kysely";
import type { Db } from "../connect/connect.ts";

// Postgres channels that tell control about changes made elsewhere.
// The payload is a request id, a project id or an agent key id.
export const CHANNELS = { approvals: "quard_approvals", fleet: "quard_fleet", keys: "quard_keys" } as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

// Inside a transaction, Postgres sends it only when the transaction commits
export async function notify(db: Db, channel: Channel, payload: string): Promise<void> {
    await sql`SELECT pg_notify(${channel}, ${payload})`.execute(db);
}

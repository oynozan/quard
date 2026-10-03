import { sql } from "kysely";
import type { Db } from "../../../connect/connect.ts";

// An app is named by its agent key, and shown as its newest connection reported it
export type ConnectedAppRow = {
    keyId: string;
    name: string;
    prefix: string;
    sdk: string;
    host: string;
    rulesHash: string;
    // Null while a connection is open, else when the last one closed
    disconnectedAt: Date | null;
    // What its open connections run, or its newest connection when none is open
    rulesHashes: string[];
};

// Apps still connected, or last seen after `since`, by name
export async function connectedApps(db: Db, projectId: string, options: { since: Date }): Promise<ConnectedAppRow[]> {
    // A connection without rules never finished hello, so it does not count
    const { rows } = await sql<ConnectedAppRow>`
        WITH linked AS (
            SELECT key_id, id, sdk, host, rules_hash, connected_at, disconnected_at
            FROM sdk_connections
            WHERE project_id = ${projectId} AND rules_hash IS NOT NULL
        ), apps AS (
            SELECT key_id, bool_and(disconnected_at IS NOT NULL) AS offline, max(disconnected_at) AS closed_at
            FROM linked
            GROUP BY key_id
        )
        SELECT
            k.id AS "keyId",
            k.name,
            k.prefix,
            newest.sdk,
            newest.host,
            newest.rules_hash AS "rulesHash",
            CASE WHEN a.offline THEN a.closed_at END AS "disconnectedAt",
            array(
                SELECT DISTINCT l.rules_hash
                FROM linked l
                WHERE l.key_id = a.key_id AND (l.disconnected_at IS NULL OR l.id = newest.id)
                ORDER BY l.rules_hash
            ) AS "rulesHashes"
        FROM apps a
        JOIN agent_keys k ON k.project_id = ${projectId} AND k.id = a.key_id
        CROSS JOIN LATERAL (
            SELECT l.id, l.sdk, l.host, l.rules_hash
            FROM linked l
            WHERE l.key_id = a.key_id
            ORDER BY l.disconnected_at IS NULL DESC, l.connected_at DESC, l.id DESC
            LIMIT 1
        ) newest
        WHERE NOT a.offline OR a.closed_at >= ${options.since}
        ORDER BY k.name, k.id
    `.execute(db);
    return rows;
}

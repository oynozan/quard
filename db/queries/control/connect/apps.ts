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
            WHERE project_id = ${projectId}
                AND rules_hash IS NOT NULL
                AND (disconnected_at IS NULL OR disconnected_at >= ${options.since})
        ), newest AS (
            SELECT DISTINCT ON (key_id) key_id, sdk, host, rules_hash
            FROM linked
            ORDER BY key_id, disconnected_at IS NULL DESC, connected_at DESC, id DESC
        ), apps AS (
            SELECT
                key_id,
                bool_and(disconnected_at IS NOT NULL) AS offline,
                max(disconnected_at) AS closed_at,
                array_agg(DISTINCT rules_hash ORDER BY rules_hash) FILTER (WHERE disconnected_at IS NULL) AS running
            FROM linked
            GROUP BY key_id
        )
        SELECT
            k.id AS "keyId",
            k.name,
            k.prefix,
            n.sdk,
            n.host,
            n.rules_hash AS "rulesHash",
            CASE WHEN a.offline THEN a.closed_at END AS "disconnectedAt",
            CASE WHEN a.offline THEN ARRAY[n.rules_hash] ELSE a.running END AS "rulesHashes"
        FROM apps a
        JOIN newest n ON n.key_id = a.key_id
        JOIN agent_keys k ON k.project_id = ${projectId} AND k.id = a.key_id
        ORDER BY k.name, k.id
    `.execute(db);
    return rows;
}

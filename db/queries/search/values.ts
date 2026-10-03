import { sql, type SqlBool } from "kysely";
import type { Db } from "../../connect/connect.ts";

export type MatchLabel = { origin: string; trust: "trusted" | "untrusted"; sensitivity: "internal" | "public" };

type MatchBase = {
    runId: string;
    stepId: string;
    agent: string;
    at: Date;
    // The search keys found here, in search order. The first tells how it matched.
    matched: string[];
};

// Content a run read: model input, or a tool's output
export type ContentMatchRow = MatchBase & {
    source: "content";
    // The step that read it. Null until that step's row arrives.
    stepKind: "model_call" | "tool_call" | null;
    stepName: string | null;
    label: MatchLabel;
};

// A tool call that sent the value in its arguments
export type CallMatchRow = MatchBase & {
    source: "call";
    stepName: string;
    // Redacted, as stored
    arguments: unknown;
    // Where the value came from: the run's earliest content holding the first
    // matched key, read at or before the call. Null when no content had it.
    label: MatchLabel | null;
};

export type ValueMatchRow = ContentMatchRow | CallMatchRow;

// Total counts matched steps; runs counts the runs they are in
export type ValueSearch = { total: number; runs: number; matches: ValueMatchRow[] };

type Row = MatchBase & {
    source: "content" | "call";
    stepKind: "model_call" | "tool_call" | null;
    stepName: string | null;
    arguments: unknown;
    label: MatchLabel | null;
};

const LABEL = sql.raw("jsonb_build_object('origin', l.origin, 'trust', l.trust, 'sensitivity', l.sensitivity)");

// Matched steps, each once: UNION drops repeats
function countMatches(db: Db, projectId: string, keys: string[]) {
    const hits = db
        .selectFrom("labels")
        .select(["run_id", "step_id"])
        .where("project_id", "=", projectId)
        .where(sql<SqlBool>`keys && ${keys}::text[]`)
        .union(
            db
                .selectFrom("steps")
                .select(["run_id", "step_id"])
                .where("project_id", "=", projectId)
                .where("kind", "=", "tool_call")
                .where(sql<SqlBool>`detail->'keys' ?| ${keys}::text[]`),
        );
    return db
        .selectFrom(hits.as("hits"))
        .select([sql<number>`count(*)::int`.as("total"), sql<number>`count(DISTINCT run_id)::int`.as("runs")])
        .executeTakeFirstOrThrow();
}

// One row per step. When a step matches more than once, the strongest key
// wins, then a call before content ('call' sorts first), then the earliest.
function newestMatches(db: Db, projectId: string, keys: string[], limit: number) {
    return sql<Row>`
        WITH wanted AS (
            SELECT key, n FROM unnest(${keys}::text[]) WITH ORDINALITY AS w(key, n)
        ), hits AS (
            SELECT 'content' AS source, l.run_id, l.step_id, l.agent, l.at, l.content_id,
                ARRAY(SELECT key FROM wanted WHERE key = ANY(l.keys) ORDER BY n) AS matched,
                s.kind AS step_kind, s.name AS step_name, NULL::jsonb AS arguments, ${LABEL} AS label
            FROM labels l
            LEFT JOIN steps s ON s.project_id = l.project_id AND s.run_id = l.run_id AND s.step_id = l.step_id
            WHERE l.project_id = ${projectId} AND l.keys && ${keys}::text[]
            UNION ALL
            SELECT 'call', s.run_id, s.step_id, s.agent, s.at, NULL,
                m.matched, s.kind, s.name, s.detail->'arguments', src.label
            FROM steps s
            CROSS JOIN LATERAL (
                SELECT ARRAY(SELECT key FROM wanted WHERE s.detail->'keys' ? key ORDER BY n) AS matched
            ) m
            LEFT JOIN LATERAL (
                SELECT ${LABEL} AS label
                FROM labels l
                WHERE l.project_id = s.project_id AND l.run_id = s.run_id
                    AND m.matched[1] = ANY(l.keys) AND l.at <= s.at
                ORDER BY l.at, l.content_id
                LIMIT 1
            ) src ON true
            WHERE s.project_id = ${projectId} AND s.kind = 'tool_call' AND s.detail->'keys' ?| ${keys}::text[]
        ), best AS (
            SELECT DISTINCT ON (run_id, step_id) *
            FROM hits
            ORDER BY run_id, step_id, array_position(${keys}::text[], matched[1]), source, at, content_id
        )
        SELECT source, run_id AS "runId", step_id AS "stepId", agent, at, matched,
            step_kind AS "stepKind", step_name AS "stepName", arguments, label
        FROM best
        ORDER BY at DESC, run_id, step_id
        LIMIT ${limit}
    `.execute(db);
}

function matchOf({ source, stepKind, stepName, arguments: args, label, ...base }: Row): ValueMatchRow {
    // Content rows always carry their own label, and calls always have a name
    if (source === "content") {
        return { ...base, source, stepKind, stepName, label: label as MatchLabel };
    }
    return { ...base, source, stepName: stepName as string, arguments: args, label };
}

// Steps whose content or tool arguments hold one of the keys, newest first.
// Keys come from searchKeys, strongest first.
export async function findValue(
    db: Db,
    projectId: string,
    keys: string[],
    options: { limit: number },
): Promise<ValueSearch> {
    if (keys.length === 0) {
        return { total: 0, runs: 0, matches: [] };
    }
    const wanted = [...new Set(keys)];
    const [counts, page] = await Promise.all([
        countMatches(db, projectId, wanted),
        newestMatches(db, projectId, wanted, options.limit),
    ]);
    return { ...counts, matches: page.rows.map(matchOf) };
}

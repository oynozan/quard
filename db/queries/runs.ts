import { sql } from "kysely";
import type { Db } from "../connect/connect.ts";
import { beatingRuns } from "./approvals/run-waiters.ts";

export type RunSummary = {
    runId: string;
    agent: string;
    startedAt: Date;
    lastEventAt: Date;
    // Null until the run reports how it finished
    endedAt: Date | null;
    outcome: "completed" | "failed" | "blocked" | null;
    error: string | null;
    modelCalls: number;
    toolCalls: number;
    blocked: number;
    costUsd: number;
    // False when some model call has no known price
    costKnown: boolean;
    // Settled x402 spend, and false when a settled token has no known USD value
    spendUsd: number;
    spendKnown: boolean;
    influenced: boolean;
    flagged: boolean;
    degraded: boolean;
};

export type RunStep = {
    stepId: string;
    kind: "model_call" | "tool_call";
    agent: string;
    parentStepId: string | null;
    name: string;
    callId: string | null;
    status: string;
    influenced: boolean;
    flagged: boolean;
    at: Date;
    durationMs: number;
    detail: unknown;
};

export type RunLabel = {
    contentId: string;
    stepId: string;
    agent: string;
    origin: string;
    trust: "trusted" | "untrusted";
    sensitivity: "internal" | "public";
    flags: string[];
    keys: string[];
    at: Date;
};

export type RunDecision = {
    eventId: string;
    stepId: string;
    agent: string;
    tool: string;
    guard: string;
    rule: string;
    decision: string;
    mode: "block" | "observe";
    enforced: boolean;
    reason: string | null;
    field: string | null;
    at: Date;
    // The active rules when it was made, and the approval request that answered it
    rulesHash: string | null;
    requestId: string | null;
};

// A decision with what only its stored event holds
export type RunDecisionDetail = RunDecision & {
    // The event arrived late, or after a failed send
    degraded: boolean;
    // A detector's risk score, from 0 to 1
    score: number | null;
};

export type RunWarning = { eventId: string; stepId: string | null; agent: string; at: Date; body: unknown };

export type RunDetail = RunSummary & {
    origins: unknown;
    steps: RunStep[];
    labels: RunLabel[];
    decisions: RunDecisionDetail[];
    warnings: RunWarning[];
};

const SUMMARY = [
    "run_id as runId",
    "agent",
    "started_at as startedAt",
    "last_event_at as lastEventAt",
    "ended_at as endedAt",
    "outcome",
    "error",
    "model_calls as modelCalls",
    "tool_calls as toolCalls",
    "blocked",
    "cost_usd as costUsd",
    "cost_known as costKnown",
    "spend_usd as spendUsd",
    "spend_known as spendKnown",
    "influenced",
    "flagged",
    "degraded",
] as const;

// What the runs list shows beyond the summary. Guard decision counts leave out
// routine permission allows; "allowed" is everything not enforced as a block or an ask.
export type RunListItem = RunSummary & {
    agents: string[];
    tools: string[];
    decisions: { allowed: number; asked: number; blocked: number };
    lastStep: { kind: "model_call" | "tool_call"; status: string } | null;
};

const IN_RUN = "project_id = runs.project_id AND run_id = runs.run_id";
const GUARDS = `${IN_RUN} AND (guard <> 'permission' OR decision <> 'allow')`;

// Every filter applies before the limit
type ListRunsOptions = {
    limit?: number;
    // Pages back from a start time
    before?: Date;
    // Only these runs, and the limit then defaults to how many there are
    runIds?: string[];
    // Only the runs this agent took part in
    agent?: string;
    // Only open runs with a call on an open request that beat since then
    beatSince?: Date;
};

// Newest runs first
export async function listRuns(db: Db, projectId: string, options: ListRunsOptions = {}): Promise<RunListItem[]> {
    if (options.runIds?.length === 0) {
        return [];
    }
    let query = db
        .selectFrom("runs")
        .select(SUMMARY)
        .select([
            sql<string[]>`array(SELECT agent FROM events WHERE ${sql.raw(IN_RUN)} GROUP BY agent ORDER BY min(at))`.as(
                "agents",
            ),
            sql<
                string[]
            >`array(SELECT DISTINCT name FROM steps WHERE ${sql.raw(IN_RUN)} AND kind = 'tool_call' ORDER BY name)`.as(
                "tools",
            ),
            sql<number>`(SELECT count(*)::int FROM decisions WHERE ${sql.raw(GUARDS)})`.as("guardTotal"),
            sql<number>`(SELECT count(*)::int FROM decisions WHERE ${sql.raw(GUARDS)} AND enforced AND decision = 'block')`.as(
                "guardBlocked",
            ),
            sql<number>`(SELECT count(*)::int FROM decisions WHERE ${sql.raw(GUARDS)} AND enforced AND decision = 'ask')`.as(
                "guardAsked",
            ),
            sql<string | null>`(SELECT kind FROM steps WHERE ${sql.raw(IN_RUN)} ORDER BY at DESC LIMIT 1)`.as(
                "lastKind",
            ),
            sql<string | null>`(SELECT status FROM steps WHERE ${sql.raw(IN_RUN)} ORDER BY at DESC LIMIT 1)`.as(
                "lastStatus",
            ),
        ])
        .where("project_id", "=", projectId);
    if (options.before !== undefined) {
        query = query.where("started_at", "<", options.before);
    }
    if (options.runIds !== undefined) {
        query = query.where("run_id", "in", options.runIds);
    }
    if (options.agent !== undefined) {
        query = query.where(
            sql<boolean>`EXISTS (SELECT 1 FROM events WHERE ${sql.raw(IN_RUN)} AND agent = ${options.agent})`,
        );
    }
    if (options.beatSince !== undefined) {
        query = query.where("outcome", "is", null).where("run_id", "in", beatingRuns(db, projectId, options.beatSince));
    }
    const rows = await query
        .orderBy("started_at", "desc")
        .limit(options.limit ?? options.runIds?.length ?? 50)
        .execute();
    return rows.map(({ guardTotal, guardBlocked, guardAsked, lastKind, lastStatus, ...run }) => ({
        ...run,
        decisions: { allowed: guardTotal - guardBlocked - guardAsked, asked: guardAsked, blocked: guardBlocked },
        lastStep:
            lastKind === null || lastStatus === null
                ? null
                : { kind: lastKind as "model_call" | "tool_call", status: lastStatus },
    }));
}

// Columns of RunStep, RunLabel and RunDecision. The agent queries read them too.
export const STEP_COLUMNS = [
    "step_id as stepId",
    "kind",
    "agent",
    "parent_step_id as parentStepId",
    "name",
    "call_id as callId",
    "status",
    "influenced",
    "flagged",
    "at",
    "duration_ms as durationMs",
    "detail",
] as const;

export const LABEL_COLUMNS = [
    "content_id as contentId",
    "step_id as stepId",
    "agent",
    "origin",
    "trust",
    "sensitivity",
    "flags",
    "keys",
    "at",
] as const;

export const DECISION_COLUMNS = [
    "event_id as eventId",
    "step_id as stepId",
    "agent",
    "tool",
    "guard",
    "rule",
    "decision",
    "mode",
    "enforced",
    "reason",
    "field",
    "at",
    "rules_hash as rulesHash",
    "request_id as requestId",
] as const;

// The extra columns of RunDecisionDetail, read from each decision's stored event.
// For selectFrom("decisions") without an alias.
const OWN_EVENT = "e.project_id = decisions.project_id AND e.event_id = decisions.event_id";
export const DECISION_EVENT_COLUMNS = [
    sql<boolean>`coalesce((SELECT e.degraded FROM events e WHERE ${sql.raw(OWN_EVENT)}), false)`.as("degraded"),
    sql<number | null>`(SELECT (e.body->>'score')::float8 FROM events e WHERE ${sql.raw(OWN_EVENT)})`.as("score"),
] as const;

export async function getRun(db: Db, projectId: string, runId: string): Promise<RunDetail | undefined> {
    const run = await db
        .selectFrom("runs")
        .select([...SUMMARY, "origins"])
        .where("project_id", "=", projectId)
        .where("run_id", "=", runId)
        .executeTakeFirst();
    if (run === undefined) {
        return undefined;
    }
    const inRun = { project_id: projectId, run_id: runId };
    const [steps, labels, decisions, warnings] = await Promise.all([
        db
            .selectFrom("steps")
            .select(STEP_COLUMNS)
            .where("project_id", "=", inRun.project_id)
            .where("run_id", "=", inRun.run_id)
            .orderBy("at")
            .execute(),
        db
            .selectFrom("labels")
            .select(LABEL_COLUMNS)
            .where("project_id", "=", inRun.project_id)
            .where("run_id", "=", inRun.run_id)
            .orderBy("at")
            .execute(),
        db
            .selectFrom("decisions")
            .select(DECISION_COLUMNS)
            .select(DECISION_EVENT_COLUMNS)
            .where("project_id", "=", inRun.project_id)
            .where("run_id", "=", inRun.run_id)
            .orderBy("at")
            .execute(),
        db
            .selectFrom("events")
            .select(["event_id as eventId", "step_id as stepId", "agent", "at", "body"])
            .where("project_id", "=", inRun.project_id)
            .where("run_id", "=", inRun.run_id)
            .where("type", "=", "warning")
            .orderBy("at")
            .execute(),
    ]);
    return { ...run, steps, labels, decisions, warnings };
}

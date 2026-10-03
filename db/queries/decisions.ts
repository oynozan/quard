import { sql, type ExpressionBuilder, type SqlBool } from "kysely";
import type { Db } from "../connect/connect.ts";
import type { Database } from "../schema/database.ts";
import { slotOf, type TimeRange } from "./activity.ts";
import { DECISION_COLUMNS, type RunDecision } from "./runs.ts";

const HOUR = 3_600_000;
const DAY = 86_400_000;

export type DecisionRow = RunDecision & { runId: string };

export type DecisionTotals = { blocked: number; asked: number };

export type GuardCount = { guard: string; count: number };

// Day 0 starts at since
export type BlockRateDay = { day: number; calls: number; blocked: number };

// Hour is whole hours since the epoch, so it is a UTC hour
export type GuardBlockHour = { guard: string; hour: number; blocks: number };

export type ToolCoverage = { seen: number; guarded: number };

type Decisions = ExpressionBuilder<Database, "decisions">;

// Every requested call gets a permission allow, so counts leave those out as listRuns does
const counted = (eb: Decisions) => eb.or([eb("guard", "<>", "permission"), eb("decision", "<>", "allow")]);

// The log also hides limit allows, which every call under a limit gets
const shown = (eb: Decisions) => eb.or([eb("guard", "not in", ["permission", "limit"]), eb("decision", "<>", "allow")]);

// A withheld output keeps step status ok, so an enforced block on the step counts too
const BLOCKED_CALL = sql<SqlBool>`s.status = 'blocked' OR EXISTS (
    SELECT 1 FROM decisions d
    WHERE d.project_id = s.project_id AND d.run_id = s.run_id AND d.step_id = s.step_id
        AND d.enforced AND d.decision = 'block'
)`;

// Newest first, without the routine allows
export async function latestDecisions(
    db: Db,
    projectId: string,
    options: TimeRange & { limit: number },
): Promise<DecisionRow[]> {
    return db
        .selectFrom("decisions")
        .select([...DECISION_COLUMNS, "run_id as runId"])
        .where("project_id", "=", projectId)
        .where("at", ">=", options.since)
        .where("at", "<", options.until)
        .where(shown)
        .orderBy("at", "desc")
        .orderBy("event_id", "desc")
        .limit(options.limit)
        .execute();
}

// Enforced blocks and asks, the way listRuns counts them
export async function decisionTotals(db: Db, projectId: string, range: TimeRange): Promise<DecisionTotals> {
    return db
        .selectFrom("decisions")
        .select([
            sql<number>`(count(*) FILTER (WHERE enforced AND decision = 'block'))::int`.as("blocked"),
            sql<number>`(count(*) FILTER (WHERE enforced AND decision = 'ask'))::int`.as("asked"),
        ])
        .where("project_id", "=", projectId)
        .where("at", ">=", range.since)
        .where("at", "<", range.until)
        .where(counted)
        .executeTakeFirstOrThrow();
}

// Decisions per guard, the most first
export async function guardCounts(db: Db, projectId: string, range: TimeRange): Promise<GuardCount[]> {
    return db
        .selectFrom("decisions")
        .select(["guard", sql<number>`count(*)::int`.as("count")])
        .where("project_id", "=", projectId)
        .where("at", ">=", range.since)
        .where("at", "<", range.until)
        .where(counted)
        .groupBy("guard")
        .orderBy("count", "desc")
        .orderBy("guard")
        .execute();
}

// Guarded tool calls and blocked calls per day, where since should be a UTC midnight
export async function blockRateDays(db: Db, projectId: string, range: TimeRange): Promise<BlockRateDay[]> {
    return db
        .selectFrom("steps as s")
        .select([
            slotOf("s.at", range.since.getTime(), DAY).as("day"),
            sql<number>`count(*)::int`.as("calls"),
            sql<number>`(count(*) FILTER (WHERE ${BLOCKED_CALL}))::int`.as("blocked"),
        ])
        .where("s.project_id", "=", projectId)
        .where("s.kind", "=", "tool_call")
        .where("s.at", ">=", range.since)
        .where("s.at", "<", range.until)
        .groupBy("day")
        .orderBy("day")
        .execute();
}

// Enforced blocks per guard and hour, for daily series and a weekday by hour grid
export async function guardBlockHours(db: Db, projectId: string, range: TimeRange): Promise<GuardBlockHour[]> {
    return db
        .selectFrom("decisions")
        .select(["guard", slotOf("at", 0, HOUR).as("hour"), sql<number>`count(*)::int`.as("blocks")])
        .where("project_id", "=", projectId)
        .where("at", ">=", range.since)
        .where("at", "<", range.until)
        .where("enforced", "=", true)
        .where("decision", "=", "block")
        .groupBy(["guard", "hour"])
        .orderBy("hour")
        .orderBy("guard")
        .execute();
}

// Tools seen in model requests or guard() calls, and how many had no unwrapped warning
export async function toolCoverage(db: Db, projectId: string, range: TimeRange): Promise<ToolCoverage> {
    return db
        .with("bare", (q) =>
            q
                .selectFrom("events")
                .select(sql<string>`body->>'tool'`.as("tool"))
                .where("project_id", "=", projectId)
                .where("type", "=", "warning")
                .where(sql`body->>'code'`, "=", "unwrapped_tool")
                .where(sql`body->>'tool'`, "is not", null)
                .where("at", ">=", range.since)
                .where("at", "<", range.until),
        )
        .with("tools", (q) =>
            q
                .selectFrom("decisions")
                .select("tool")
                .where("project_id", "=", projectId)
                .where("rule", "=", "requested-call")
                .where("at", ">=", range.since)
                .where("at", "<", range.until)
                .union(
                    q
                        .selectFrom("steps")
                        .select("name as tool")
                        .where("project_id", "=", projectId)
                        .where("kind", "=", "tool_call")
                        .where("at", ">=", range.since)
                        .where("at", "<", range.until),
                )
                // A full SDK buffer drops the allow but keeps the warning
                .union(q.selectFrom("bare").select("tool")),
        )
        .selectFrom("tools")
        .select([
            sql<number>`count(*)::int`.as("seen"),
            sql<number>`(count(*) FILTER (WHERE tools.tool NOT IN (SELECT bare.tool FROM bare)))::int`.as("guarded"),
        ])
        .executeTakeFirstOrThrow();
}

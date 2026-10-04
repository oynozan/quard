import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { TimeRange } from "../activity.ts";

// The run limits the SDK checks, as its decisions name them
export const RUN_LIMIT_RULES = ["max-depth", "max-fan-out", "max-loops", "max-steps", "max-cost"] as const;

export type RunLimitRule = (typeof RUN_LIMIT_RULES)[number];

export type RunLimitRow = {
    rule: RunLimitRule;
    // The mode of the newest decision
    mode: "block" | "observe";
    // Runs that went over in observe mode and ran on
    wouldStop: number;
    // Runs an enforced limit stopped
    stopped: number;
};

// Runs that went over each run limit in the range. Limits no run went over are left out.
export async function runLimitCounts(db: Db, projectId: string, range: TimeRange): Promise<RunLimitRow[]> {
    const rows = await db
        .selectFrom("decisions")
        .select([
            "rule",
            sql<"block" | "observe">`(array_agg(mode ORDER BY at DESC, event_id DESC))[1]`.as("mode"),
            sql<number>`(count(DISTINCT run_id) FILTER (WHERE NOT enforced))::int`.as("wouldStop"),
            sql<number>`(count(DISTINCT run_id) FILTER (WHERE enforced))::int`.as("stopped"),
        ])
        .where("project_id", "=", projectId)
        .where("guard", "=", "limit")
        .where("decision", "=", "block")
        .where("rule", "in", [...RUN_LIMIT_RULES])
        .where("at", ">=", range.since)
        .where("at", "<", range.until)
        .groupBy("rule")
        .execute();
    return rows.map((row) => ({ ...row, rule: row.rule as RunLimitRule }));
}

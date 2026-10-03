import type { Db } from "../../connect/connect.ts";
import {
    DECISION_COLUMNS,
    DECISION_EVENT_COLUMNS,
    LABEL_COLUMNS,
    STEP_COLUMNS,
    type RunDecisionDetail,
    type RunLabel,
    type RunStep,
} from "../runs.ts";

// What web's buildSteps needs to draw one run's part of an agent's timeline.
// Rows have the same shape and order as in getRun.
export type AgentRunCalls = {
    runId: string;
    // The agent's steps in this run among its newest ones, oldest first
    steps: RunStep[];
    // Every label of the run, any agent, oldest first
    labels: RunLabel[];
    // The agent's guard decisions in the run, oldest first
    decisions: RunDecisionDetail[];
};

const inRun = <T extends { runId: string }>(rows: T[], runId: string): Omit<T, "runId">[] =>
    rows.filter((row) => row.runId === runId).map(({ runId: _runId, ...row }) => row);

// The agent's newest `limit` steps of any kind, grouped by run.
// The run with the newest step comes first.
export async function agentRecentCalls(
    db: Db,
    projectId: string,
    agent: string,
    options: { limit: number },
): Promise<AgentRunCalls[]> {
    const steps = await db
        .selectFrom("steps")
        .select(STEP_COLUMNS)
        .select("run_id as runId")
        .where("project_id", "=", projectId)
        .where("agent", "=", agent)
        .orderBy("at", "desc")
        .orderBy("step_id", "desc")
        .orderBy("run_id", "desc")
        .limit(options.limit)
        .execute();
    if (steps.length === 0) {
        return [];
    }
    const runIds = [...new Set(steps.map((step) => step.runId))];
    const [labels, decisions] = await Promise.all([
        db
            .selectFrom("labels")
            .select(LABEL_COLUMNS)
            .select("run_id as runId")
            .where("project_id", "=", projectId)
            .where("run_id", "in", runIds)
            .orderBy("at")
            .orderBy("content_id")
            .execute(),
        db
            .selectFrom("decisions")
            .select(DECISION_COLUMNS)
            .select(DECISION_EVENT_COLUMNS)
            .select("run_id as runId")
            .where("project_id", "=", projectId)
            .where("agent", "=", agent)
            .where("run_id", "in", runIds)
            .orderBy("at")
            .orderBy("event_id")
            .execute(),
    ]);
    const oldestFirst = steps.toReversed();
    return runIds.map((runId) => ({
        runId,
        steps: inRun(oldestFirst, runId),
        labels: inRun(labels, runId),
        decisions: inRun(decisions, runId),
    }));
}

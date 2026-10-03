import { sql, type Expression, type RawBuilder } from "kysely";

// When a step started. Steps store when they finished and how long they took.
export function startOf(step: string): RawBuilder<Date> {
    return sql<Date>`(${sql.ref(`${step}.at`)} - ${sql.ref(`${step}.duration_ms`)} * interval '1 millisecond')`;
}

// Whether a model call read untrusted content: a label of its run stored
// before the call started, or one of the call's own inputs.
// The same rule as modelStep in web/src/lib/data/runs/live/steps.ts.
export function readUntrusted(
    projectId: string,
    runId: Expression<string>,
    start: Expression<Date>,
    stepId: Expression<string>,
): RawBuilder<boolean> {
    return sql<boolean>`EXISTS (SELECT 1 FROM labels l WHERE l.project_id = ${projectId} AND l.run_id = ${runId} AND l.trust = 'untrusted' AND (l.at < ${start} OR l.step_id = ${stepId}))`;
}

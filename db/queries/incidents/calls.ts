import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";

export type ModelCallRecord = {
    stepId: string;
    model: string;
    responseId: string | null;
    toolCalls: { callId: string; name: string; arguments: string }[];
    // The redacted request, kept only when the SDK uploaded it
    requestBody: Record<string, unknown> | null;
    // The assistant texts of the response, redacted. Empty when not recorded.
    outputText: string[];
    at: Date;
};

// A run's model calls as the SDK sent them, oldest first. Replay rebuilds requests from them.
export async function getModelCalls(db: Db, projectId: string, runId: string): Promise<ModelCallRecord[]> {
    return db
        .selectFrom("events")
        .select([
            sql<string>`step_id`.as("stepId"),
            sql<string>`body->>'model'`.as("model"),
            sql<string | null>`body->>'responseId'`.as("responseId"),
            sql<ModelCallRecord["toolCalls"]>`body->'toolCalls'`.as("toolCalls"),
            sql<Record<string, unknown> | null>`body->'requestBody'`.as("requestBody"),
            sql<string[]>`coalesce(body->'outputText', '[]'::jsonb)`.as("outputText"),
            "at",
        ])
        .where("project_id", "=", projectId)
        .where("run_id", "=", runId)
        .where("type", "=", "model_call")
        .orderBy("at")
        .orderBy("event_id")
        .execute();
}

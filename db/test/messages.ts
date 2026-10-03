import type { Db } from "../connect/connect.ts";
import type { AgentMessagesTable } from "../schema/database.ts";

// One agent_messages row, as message and handoff events leave it. Times are ISO strings.
export type MessageRow = {
    runId: string;
    stepId: string;
    kind: AgentMessagesTable["kind"];
    from: string;
    to: string;
    at: string;
    parentStepId?: string;
    trust?: "trusted" | "untrusted";
    verified?: boolean;
};

let next = 0;

// Stores rows straight in agent_messages. Their runs must exist.
export async function insertMessages(db: Db, projectId: string, rows: MessageRow[]): Promise<void> {
    await db
        .insertInto("agent_messages")
        .values(
            rows.map((row) => ({
                project_id: projectId,
                event_id: `m${++next}`,
                run_id: row.runId,
                step_id: row.stepId,
                kind: row.kind,
                from_agent: row.from,
                to_agent: row.to,
                parent_step_id: row.parentStepId ?? null,
                trust: row.trust ?? "trusted",
                sensitivity: "internal",
                verified: row.verified ?? true,
                at: row.at,
            })),
        )
        .execute();
}

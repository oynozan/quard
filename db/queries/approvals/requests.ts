import { newEventId, type ApprovalAnswer } from "@quard/shared";
import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import { CHANNELS, notify } from "../../notify/channels.ts";
import { REQUEST_FIELDS, type JsonFields } from "./fields.ts";
import type { ApprovalRequestDetail, ApprovalRequestInput, RequestDecision } from "./types.ts";

// Finds the open request for the same agent, tool and arguments, or opens one.
// The partial unique index allows one open request per call. On a clash the
// no-op update makes RETURNING give the open one, even under concurrent asks.
// Only a new request tells the dashboard.
export async function openApprovalRequest(
    db: Db,
    projectId: string,
    input: ApprovalRequestInput,
): Promise<{ id: string; created: boolean }> {
    const id = `apr_${newEventId()}`;
    return db.transaction().execute(async (trx) => {
        const row = await trx
            .insertInto("approval_requests")
            .values({
                project_id: projectId,
                id,
                run_id: input.runId,
                step_id: input.stepId,
                agent: input.agent,
                tool: input.tool,
                args_hash: input.argsHash,
                args: JSON.stringify(input.args ?? null),
                masked: JSON.stringify(input.masked ?? null),
                labels: JSON.stringify(input.labels),
                context: JSON.stringify(input.context),
                reasons: JSON.stringify(input.reasons),
                rules_hash: input.rulesHash ?? null,
            })
            .onConflict((conflict) =>
                conflict
                    .columns(["project_id", "agent", "tool", "args_hash"])
                    .where("answer", "is", null)
                    .doUpdateSet((eb) => ({ opened_at: eb.ref("approval_requests.opened_at") })),
            )
            .returning("id")
            .executeTakeFirstOrThrow();
        const created = row.id === id;
        if (created) {
            await notify(trx, CHANNELS.live, JSON.stringify({ project: projectId, topic: "approvals" }));
        }
        return { id: row.id, created };
    });
}

export async function getApprovalRequest(
    db: Db,
    projectId: string,
    id: string,
): Promise<ApprovalRequestDetail | undefined> {
    return db
        .selectFrom("approval_requests")
        .select([
            ...REQUEST_FIELDS,
            "args",
            "answer",
            "decided_by as decidedBy",
            "decided_at as decidedAt",
            "used_by as usedBy",
            "used_at as usedAt",
        ])
        .$narrowType<JsonFields>()
        .where("project_id", "=", projectId)
        .where("id", "=", id)
        .executeTakeFirst();
}

// The requests among `ids` that someone decided, in any project
export async function decidedRequests(db: Db, ids: string[]): Promise<RequestDecision[]> {
    return db
        .selectFrom("approval_requests")
        .select(["project_id as projectId", "id", "answer", "used_by as usedBy"])
        .$narrowType<{ answer: ApprovalAnswer }>()
        .where(sql<boolean>`id = any(${ids})`)
        .where("answer", "is not", null)
        .orderBy("decided_at")
        .orderBy("id")
        .execute();
}

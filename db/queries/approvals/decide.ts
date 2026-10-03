import { newEventId, type ApprovalAnswer } from "@quard/shared";
import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import { CHANNELS, notify } from "../../notify/channels.ts";

export type DecideResult = "decided" | "already_decided" | "not_found";

// An approver's answer, in one transaction. The full arguments go; the hash
// and the masked arguments stay. Telling the waiting calls is control's job:
// it hears the notification, or finds the answer on its next check.
export async function decideApproval(
    db: Db,
    projectId: string,
    requestId: string,
    answer: ApprovalAnswer,
    by: string,
): Promise<DecideResult> {
    return db.transaction().execute(async (trx) => {
        const row = await trx
            .updateTable("approval_requests")
            .set({ answer, decided_by: by, decided_at: sql<Date>`now()`, args: null })
            .where("project_id", "=", projectId)
            .where("id", "=", requestId)
            .where("answer", "is", null)
            .returning(["agent", "tool", "args_hash", "masked"])
            .executeTakeFirst();
        if (row === undefined) {
            const found = await trx
                .selectFrom("approval_requests")
                .select("id")
                .where("project_id", "=", projectId)
                .where("id", "=", requestId)
                .executeTakeFirst();
            return found === undefined ? "not_found" : "already_decided";
        }
        if (answer === "always") {
            // An active grant for the same call already covers it
            await trx
                .insertInto("approval_grants")
                .values({
                    project_id: projectId,
                    id: `grt_${newEventId()}`,
                    request_id: requestId,
                    agent: row.agent,
                    tool: row.tool,
                    args_hash: row.args_hash,
                    masked: JSON.stringify(row.masked),
                    approved_by: by,
                })
                .onConflict((conflict) =>
                    conflict
                        .columns(["project_id", "agent", "tool", "args_hash"])
                        .where("revoked_at", "is", null)
                        .doNothing(),
                )
                .execute();
        }
        await notify(trx, CHANNELS.approvals, requestId);
        return "decided";
    });
}

// Stops an "always approve". Later identical calls ask again.
export async function revokeGrant(db: Db, projectId: string, grantId: string, by: string): Promise<boolean> {
    const row = await db
        .updateTable("approval_grants")
        .set({ revoked_at: sql<Date>`now()`, revoked_by: by })
        .where("project_id", "=", projectId)
        .where("id", "=", grantId)
        .where("revoked_at", "is", null)
        .returning("id")
        .executeTakeFirst();
    return row !== undefined;
}

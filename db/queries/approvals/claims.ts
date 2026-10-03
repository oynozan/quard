import { sql, type ExpressionBuilder } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { Database } from "../../schema/database.ts";
import type { OnceClaim } from "./types.ts";

// The unrevoked "always approve" for this agent, tool and arguments
export async function findActiveGrant(
    db: Db,
    projectId: string,
    agent: string,
    tool: string,
    argsHash: string,
): Promise<{ id: string } | undefined> {
    return db
        .selectFrom("approval_grants")
        .select("id")
        .where("project_id", "=", projectId)
        .where("agent", "=", agent)
        .where("tool", "=", tool)
        .where("args_hash", "=", argsHash)
        .where("revoked_at", "is", null)
        .executeTakeFirst();
}

// Counts one more call that passed on a grant. False once it is revoked.
export async function useGrant(db: Db, projectId: string, grantId: string): Promise<boolean> {
    const row = await db
        .updateTable("approval_grants")
        .set((eb) => ({ times_used: eb("times_used", "+", 1), last_used_at: sql<Date>`now()` }))
        .where("project_id", "=", projectId)
        .where("id", "=", grantId)
        .where("revoked_at", "is", null)
        .returning("id")
        .executeTakeFirst();
    return row !== undefined;
}

// Gives this call an unused "approve once" for the identical call, oldest
// decision first, for example one given after the waiting process died.
// SKIP LOCKED lets two claims at the same time take different requests.
export async function claimOnce(db: Db, projectId: string, claim: OnceClaim): Promise<string | undefined> {
    const sameCall = (eb: ExpressionBuilder<Database, "approval_requests">) =>
        eb.and([
            eb("project_id", "=", projectId),
            eb("agent", "=", claim.agent),
            eb("tool", "=", claim.tool),
            eb("args_hash", "=", claim.argsHash),
            eb("answer", "=", "once"),
        ]);
    // Already given to this call, for example before a reconnect
    const mine = await db
        .selectFrom("approval_requests")
        .select("id")
        .where(sameCall)
        .where("used_by", "=", claim.askId)
        .executeTakeFirst();
    if (mine !== undefined) {
        return mine.id;
    }
    const claimed = await db
        .updateTable("approval_requests")
        .set({ used_by: claim.askId, used_at: sql<Date>`now()` })
        .where("project_id", "=", projectId)
        .where("id", "=", (eb) =>
            eb
                .selectFrom("approval_requests")
                .select("id")
                .where(sameCall)
                .where("used_by", "is", null)
                .orderBy("decided_at")
                .orderBy("id")
                .limit(1)
                .forUpdate()
                .skipLocked(),
        )
        .where("used_by", "is", null)
        .returning("id")
        .executeTakeFirst();
    return claimed?.id;
}

// Claims a decided "approve once" for this call. True when it is this call's
// to run: unused until now, or already claimed by the same call.
export async function claimRequest(db: Db, projectId: string, requestId: string, askId: string): Promise<boolean> {
    const row = await db
        .updateTable("approval_requests")
        .set({ used_by: askId, used_at: sql<Date>`coalesce(used_at, now())` })
        .where("project_id", "=", projectId)
        .where("id", "=", requestId)
        .where("answer", "=", "once")
        .where((eb) => eb.or([eb("used_by", "is", null), eb("used_by", "=", askId)]))
        .returning("id")
        .executeTakeFirst();
    return row !== undefined;
}

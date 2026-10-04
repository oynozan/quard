import { sql, type ExpressionBuilder } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { Database } from "../../schema/database.ts";
import { STILL_WAITS } from "./live.ts";
import type { OnceClaim, OnceTurn } from "./types.ts";

// A waiter's place in line, the request's own call (its run and step) first, then the longest wait
function placeOf(waiter: "w" | "me") {
    const column = (name: string) => sql.ref(`${waiter}.${name}`);
    return sql`((${column("run_id")}, ${column("step_id")}) <> (approval_requests.run_id, approval_requests.step_id),
        ${column("since")}, ${column("ask_id")})`;
}

// No call ahead of this one still waits on the request row `approval_requests`, and a call not on it comes last
function firstInLine(askId: string) {
    return sql<boolean>`NOT EXISTS (
        SELECT 1 FROM approval_waiters w
        WHERE w.project_id = approval_requests.project_id AND w.request_id = approval_requests.id
            AND w.ask_id <> ${askId} AND ${STILL_WAITS}
            AND NOT EXISTS (
                SELECT 1 FROM approval_waiters me
                WHERE me.project_id = w.project_id AND me.request_id = w.request_id AND me.ask_id = ${askId}
                    AND ${placeOf("me")} < ${placeOf("w")}
            )
    )`;
}

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
// decision first, once no call on that request still beats: for example one
// given after the waiting process died.
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
                .where(firstInLine(claim.askId))
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

// Claims a decided "approve once" for this call. It runs when the call
// already holds it, or when it is unused and the call is first in line.
export async function claimRequest(db: Db, projectId: string, requestId: string, askId: string): Promise<OnceTurn> {
    const row = await db
        .updateTable("approval_requests")
        .set({ used_by: askId, used_at: sql<Date>`coalesce(used_at, now())` })
        .where("project_id", "=", projectId)
        .where("id", "=", requestId)
        .where("answer", "=", "once")
        .where((eb) => eb.or([eb("used_by", "=", askId), eb.and([eb("used_by", "is", null), firstInLine(askId)])]))
        .returning("id")
        .executeTakeFirst();
    if (row !== undefined) {
        return "runs";
    }
    const unused = await db
        .selectFrom("approval_requests")
        .select("id")
        .where("project_id", "=", projectId)
        .where("id", "=", requestId)
        .where("answer", "=", "once")
        .where("used_by", "is", null)
        .executeTakeFirst();
    return unused === undefined ? "used" : "waits";
}

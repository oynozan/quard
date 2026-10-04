import type { ApprovalAnswer } from "@quard/shared";
import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import { REQUEST_FIELDS, type JsonFields } from "./fields.ts";
import { REQUEST_LIVE } from "./live.ts";
import type { ApprovalGrantItem, DecidedApprovalItem, OpenApprovalItem } from "./types.ts";

type OpenRequest = Omit<OpenApprovalItem, "waiters">;

// How many requests wait for an answer
export async function countOpenRequests(db: Db, projectId: string): Promise<number> {
    const row = await db
        .selectFrom("approval_requests")
        .select(sql<number>`count(*)::int`.as("open"))
        .where("project_id", "=", projectId)
        .where("answer", "is", null)
        .executeTakeFirstOrThrow();
    return row.open;
}

// Open requests as the approvals page orders them: those a call still waits on
// first, then the longest wait on top. The limit cuts only requests nobody
// waits on any more, so a waiting call is never left out.
export async function listOpenRequests(db: Db, projectId: string, limit = 100): Promise<OpenApprovalItem[]> {
    const live = db
        .selectFrom("approval_requests")
        .select(sql<number>`count(*)`.as("live"))
        .where("project_id", "=", projectId)
        .where("answer", "is", null)
        .where(REQUEST_LIVE);
    const requests = await db
        .selectFrom("approval_requests")
        .select([...REQUEST_FIELDS, "args"])
        .$narrowType<JsonFields>()
        .where("project_id", "=", projectId)
        .where("answer", "is", null)
        .orderBy(REQUEST_LIVE, "desc")
        .orderBy("opened_at")
        .orderBy("id")
        .limit(sql<number>`greatest(${limit}, ${live})`)
        .execute();
    return withWaiters(db, projectId, requests);
}

// One open request with the calls waiting on it
export async function getOpenRequest(db: Db, projectId: string, id: string): Promise<OpenApprovalItem | undefined> {
    const request = await db
        .selectFrom("approval_requests")
        .select([...REQUEST_FIELDS, "args"])
        .$narrowType<JsonFields>()
        .where("project_id", "=", projectId)
        .where("id", "=", id)
        .where("answer", "is", null)
        .executeTakeFirst();
    return request === undefined ? undefined : (await withWaiters(db, projectId, [request]))[0];
}

// Adds the calls waiting on each request, oldest first
async function withWaiters(db: Db, projectId: string, requests: OpenRequest[]): Promise<OpenApprovalItem[]> {
    const waiters = await db
        .selectFrom("approval_waiters")
        .select([
            "request_id as requestId",
            "ask_id as askId",
            "run_id as runId",
            "step_id as stepId",
            "agent",
            "since",
            "last_beat_at as lastBeatAt",
            "done_at as doneAt",
        ])
        .where("project_id", "=", projectId)
        .where(sql<boolean>`request_id = any(${requests.map((request) => request.id)})`)
        .orderBy("since")
        .orderBy("ask_id")
        .execute();
    return requests.map((request) => ({
        ...request,
        waiters: waiters
            .filter((waiter) => waiter.requestId === request.id)
            .map(({ requestId: _requestId, ...waiter }) => waiter),
    }));
}

// "Always approve" answers, newest first, revoked ones included
export async function listGrants(db: Db, projectId: string): Promise<ApprovalGrantItem[]> {
    return db
        .selectFrom("approval_grants")
        .select([
            "id",
            "request_id as requestId",
            "agent",
            "tool",
            "args_hash as argsHash",
            "masked",
            "approved_by as approvedBy",
            "approved_at as approvedAt",
            "times_used as timesUsed",
            "last_used_at as lastUsedAt",
            "revoked_at as revokedAt",
            "revoked_by as revokedBy",
        ])
        .where("project_id", "=", projectId)
        .orderBy("approved_at", "desc")
        .orderBy("id", "desc")
        .execute();
}

// Past answers, newest first. Only the masked arguments are left.
export async function listDecidedRequests(db: Db, projectId: string, limit = 50): Promise<DecidedApprovalItem[]> {
    return db
        .selectFrom("approval_requests")
        .select([
            ...REQUEST_FIELDS,
            "answer",
            "decided_by as decidedBy",
            "decided_at as decidedAt",
            "used_by as usedBy",
            "used_at as usedAt",
        ])
        .$narrowType<JsonFields & { answer: ApprovalAnswer; decidedAt: Date }>()
        .where("project_id", "=", projectId)
        .where("answer", "is not", null)
        .orderBy("decided_at", "desc")
        .orderBy("id", "desc")
        .limit(limit)
        .execute();
}

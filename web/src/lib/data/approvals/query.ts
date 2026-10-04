import {
    countOpenRequests,
    getOpenRequest,
    getRun,
    listDecidedRequests,
    listGrants,
    listOpenRequests,
    type Db,
} from "@quard/db";
import { unstable_rethrow } from "next/navigation";
import { projectScope } from "../scope";
import { runDetailOf } from "../runs/live/detail";
import type { RunDetail } from "../runs/types";
import type { ApprovalRequest } from "../types";
import { detailOf, requestOf } from "./live/detail";
import { decisionOf, grantOf } from "./live/history";
import type { ApprovalDetail, ApprovalsData } from "./types";

// The runs that asked, as the run view maps them. A run not stored yet is left out.
async function runsOf(db: Db, projectId: string, runIds: string[], now: number): Promise<Map<string, RunDetail>> {
    const ids = [...new Set(runIds)];
    const stored = await Promise.all(ids.map((runId) => getRun(db, projectId, runId)));
    const runs = new Map<string, RunDetail>();
    stored.forEach((run, index) => {
        if (run) runs.set(ids[index], runDetailOf(run, now));
    });
    return runs;
}

// Everything the approvals page shows: at least `shown` open requests, with every one a call
// still waits on, plus "always approve" grants and past answers
export async function getApprovals(shown: number): Promise<ApprovalsData> {
    const scope = await projectScope();
    if (!scope) return { open: [], more: 0, grants: [], decisions: [] };
    const { db, project } = scope;
    const now = Date.now();
    const [open, total, grants, decided] = await Promise.all([
        listOpenRequests(db, project.id, shown),
        countOpenRequests(db, project.id),
        listGrants(db, project.id),
        listDecidedRequests(db, project.id),
    ]);
    const runs = await runsOf(
        db,
        project.id,
        open.map((item) => item.runId),
        now,
    );
    return {
        open: open.map((item) => detailOf(item, runs.get(item.runId) ?? null, now)),
        more: Math.max(0, total - open.length),
        grants: grants.map(grantOf),
        decisions: decided.map(decisionOf),
    };
}

// One open request with its arguments, origins, influence path and heartbeat
export async function getApproval(id: string): Promise<ApprovalDetail | null> {
    const scope = await projectScope();
    if (!scope) return null;
    const { db, project } = scope;
    const item = await getOpenRequest(db, project.id, id);
    if (!item) return null;
    const now = Date.now();
    const runs = await runsOf(db, project.id, [item.runId], now);
    return detailOf(item, runs.get(item.runId) ?? null, now);
}

// Open requests for the overview, in the approvals page's order
export async function openApprovalRequests(): Promise<ApprovalRequest[]> {
    const scope = await projectScope();
    if (!scope) return [];
    const { db, project } = scope;
    const now = Date.now();
    return (await listOpenRequests(db, project.id)).map((item) => requestOf(item, now));
}

// The sidebar count. When it cannot be read the badge is left out, so no page breaks over it.
export async function openApprovalCount(): Promise<number> {
    try {
        const scope = await projectScope();
        return scope ? await countOpenRequests(scope.db, scope.project.id) : 0;
    } catch (error) {
        unstable_rethrow(error);
        console.error("Quard: could not count open approvals", error);
        return 0;
    }
}

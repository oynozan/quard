import type { OpenApprovalItem } from "@quard/db";
import type { RunDetail } from "../../runs/types";
import type { ApprovalRequest } from "../../types";
import type { ApprovalDetail } from "../types";
import { approvalArgOf, parseArgs } from "./args";
import { heartbeatOf, joinedOf } from "./heartbeat";
import { checksOf, pathOf } from "./path";
import { requestReason } from "./reasons";

// The request as the overview lists it: who asks, with which values, and whether a call still waits
export function requestOf(item: OpenApprovalItem, now: number): ApprovalRequest {
    return {
        id: item.id,
        runId: item.runId,
        stepId: item.stepId,
        agent: item.agent,
        tool: item.tool,
        args: parseArgs(item).map(approvalArgOf),
        reason: requestReason(item.reasons, item.tool),
        openedAt: item.openedAt.getTime(),
        waiting: heartbeatOf(item, now).state === "live",
    };
}

// One open request as the approver sees it. The run adds the influence path and the checks.
export function detailOf(item: OpenApprovalItem, run: RunDetail | null, now: number): ApprovalDetail {
    const parsed = parseArgs(item);
    return {
        request: requestOf(item, now),
        args: parsed.map((arg) => ({ ...approvalArgOf(arg), masked: arg.masked })),
        path: pathOf(run, item, parsed),
        decisions: checksOf(run, item),
        heartbeat: heartbeatOf(item, now),
        joined: joinedOf(item, now),
        argsHash: item.argsHash,
    };
}

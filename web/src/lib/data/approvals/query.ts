import { influencePath } from "../paths/build";
import { catalogRuns } from "../runs/catalog";
import { alwaysGrants, recentDecisions } from "./history";
import { openCall, openIds, requestOf, type OpenCall } from "./requests";
import type { ApprovalArgDetail, ApprovalDetail, ApprovalsData, JoinedCall } from "./types";

// Identical calls from other runs that wait on the same request instead of opening a new one.
function joinedCalls(open: OpenCall): JoinedCall[] {
    return catalogRuns()
        .filter((run) => run.detail.summary.id !== open.spec.runId)
        .flatMap((run) =>
            run.detail.steps
                .filter((step) => step.approval?.requestId === open.spec.id && step.status === "waiting")
                .map((step) => ({
                    runId: run.detail.summary.id,
                    stepId: step.parentId ?? step.id,
                    agent: step.agent,
                    since: step.startedAt,
                })),
        );
}

function detailOf(open: OpenCall): ApprovalDetail {
    const request = requestOf(open);
    const args: ApprovalArgDetail[] = request.args.map((arg) => {
        const step = open.call.args.find((item) => item.name === arg.name);
        return {
            ...arg,
            kind: step?.valueLabel.kind ?? "text",
            traced: step?.valueLabel.traced ?? false,
            masked: step?.value ?? arg.value,
            appearances: step?.valueLabel.appearances ?? [],
        };
    });
    const joined = joinedCalls(open);
    return {
        request,
        args,
        path: influencePath(open.run.detail, open.call),
        context: open.call.context,
        decisions: open.run.detail.steps.flatMap((step) =>
            step.parentId === open.call.id && step.guard ? [step.guard] : [],
        ),
        heartbeat: open.spec.heartbeat,
        identicalWaiting: joined.length > 0,
        joined,
        argsHash: open.approval.approval?.argsHash ?? "",
        run: open.run.detail.summary,
    };
}

// Everything the approvals page shows: open requests, "always approve" grants and past answers.
export async function getApprovals(): Promise<ApprovalsData> {
    const open = openIds().flatMap((id) => {
        const call = openCall(id);
        return call ? [detailOf(call)] : [];
    });
    return { open, grants: alwaysGrants(), decisions: recentDecisions() };
}

// One open request with its arguments, origins, influence path and heartbeat.
export async function getApproval(id: string): Promise<ApprovalDetail | null> {
    const call = openCall(id);
    return call ? detailOf(call) : null;
}

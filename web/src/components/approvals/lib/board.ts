import type { AlwaysGrant, ApprovalAnswer, ApprovalDetail, ApprovalsData } from "@/lib/data/approvals/types";
import { decisionOf, grantOf, orderOpen } from "./model";

// What the board shows. `fresh` holds the requests answered here that the server has not confirmed yet.
export type BoardView = ApprovalsData & { fresh: string[] };

export type BoardChange =
    | { kind: "answer"; item: ApprovalDetail; answer: ApprovalAnswer; at: number; by: string }
    | { kind: "revoke"; grant: AlwaysGrant; at: number; by: string };

// The server's lists, live requests first
export function boardOf(data: ApprovalsData): BoardView {
    return { ...data, open: orderOpen(data.open), fresh: [] };
}

function covered(grants: AlwaysGrant[], item: ApprovalDetail): boolean {
    const { agent, tool } = item.request;
    return grants.some(
        (grant) =>
            grant.revokedAt === null &&
            grant.agent === agent &&
            grant.tool === tool &&
            grant.argsHash === item.argsHash,
    );
}

// An answer or a revoke shown before the server confirms it. Once the server's
// lists hold the change, they are kept as they are.
export function applyChange(view: BoardView, change: BoardChange): BoardView {
    if (change.kind === "revoke") {
        const grants = view.grants.map((grant) =>
            grant.id === change.grant.id && grant.revokedAt === null
                ? { ...grant, revokedAt: change.at, revokedBy: change.by }
                : grant,
        );
        return { ...view, grants };
    }
    const { item, answer, at, by } = change;
    const id = item.request.id;
    const saved = view.decisions.some((decision) => decision.requestId === id);
    const granted = answer !== "always approve" || covered(view.grants, item);
    return {
        open: view.open.filter((entry) => entry.request.id !== id),
        more: view.more,
        decisions: saved ? view.decisions : [decisionOf(item, answer, at, by), ...view.decisions],
        grants: granted ? view.grants : [grantOf(item, at, by), ...view.grants],
        fresh: saved ? view.fresh : [...view.fresh, id],
    };
}

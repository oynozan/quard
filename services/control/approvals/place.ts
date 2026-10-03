import { addWaiter, claimOnce, findActiveGrant, finishWaiters, openApprovalRequest, useGrant } from "@quard/db";
import type { ApprovalAnswer, AskMessage } from "@quard/shared";
import type { Context } from "../server/context.ts";
import type { Connection } from "../socket/registry.ts";
import { send } from "../socket/send.ts";
import { requestInput, waiterInput } from "./input.ts";

// A call is answered already, or waits on a request
export type Placement =
    | { type: "decided"; answer: ApprovalAnswer; requestId?: string; grantId?: string }
    | { type: "asked"; requestId: string };

// An always approve first, then an unused approve once for the identical call, else the open request
export async function place(ctx: Context, projectId: string, ask: AskMessage): Promise<Placement> {
    const { db } = ctx;
    const grant = await findActiveGrant(db, projectId, ask.agent, ask.tool, ask.argsHash);
    // A grant revoked in between no longer counts
    if (grant !== undefined && (await useGrant(db, projectId, grant.id))) {
        return { type: "decided", answer: "always", grantId: grant.id };
    }
    const claim = { askId: ask.askId, agent: ask.agent, tool: ask.tool, argsHash: ask.argsHash };
    const once = await claimOnce(db, projectId, claim);
    if (once !== undefined) {
        return { type: "decided", answer: "once", requestId: once };
    }
    const { id } = await openApprovalRequest(db, projectId, requestInput(ask, ctx.redactor));
    await addWaiter(db, projectId, waiterInput(ask, id));
    return { type: "asked", requestId: id };
}

// Tells the SDK where its call stands and notes it here
export async function settle(
    ctx: Context,
    connection: Connection,
    ask: AskMessage,
    placement: Placement,
): Promise<void> {
    const { askId } = ask;
    if (placement.type === "asked") {
        ctx.registry.wait(connection, ask, placement.requestId);
        send(connection, { type: "asked", askId, requestId: placement.requestId });
        return;
    }
    ctx.registry.drop(connection.projectId, askId);
    const { answer, requestId, grantId } = placement;
    // The answer goes first, so a failed write never refuses an approved call
    send(connection, { type: "decided", askId, answer, requestId, grantId });
    await finishWaiters(ctx.db, connection.projectId, [askId]);
}

import { addWaiter, beatWaiters, claimRequest, finishWaiters, getApprovalRequest, waiterRequest } from "@quard/db";
import type { AskMessage, ClientMessage } from "@quard/shared";
import type { Context } from "../server/context.ts";
import { CONNECTION_LIMITS } from "../socket/limits.ts";
import type { Connection } from "../socket/registry.ts";
import { sendError } from "../socket/send.ts";
import { sameCall, waiterInput } from "./input.ts";
import { place, settle, type Placement } from "./place.ts";

type BeatMessage = Extract<ClientMessage, { type: "beat" }>;
type CancelMessage = Extract<ClientMessage, { type: "cancel" }>;

// The answer from the request a call waited on before a reconnect, or undefined to ask afresh
async function resume(
    ctx: Context,
    projectId: string,
    ask: AskMessage,
    requestId: string,
): Promise<Placement | undefined> {
    const request = await getApprovalRequest(ctx.db, projectId, requestId);
    if (request === undefined || !sameCall(request, ask)) {
        return undefined;
    }
    if (request.answer === null) {
        await addWaiter(ctx.db, projectId, waiterInput(ask, request.id));
        return { type: "asked", requestId: request.id };
    }
    // Another call already ran this "approve once"
    if (request.answer === "once" && !(await claimRequest(ctx.db, projectId, request.id, ask.askId))) {
        return undefined;
    }
    return { type: "decided", answer: request.answer, requestId: request.id };
}

// A call that needs a human
export async function ask(ctx: Context, connection: Connection, message: AskMessage): Promise<void> {
    const { projectId, waiters } = connection;
    // A call asked again keeps its place, a new one needs room
    if (waiters.size >= CONNECTION_LIMITS.waiters && !waiters.has(message.askId)) {
        sendError(connection, "too_many_waiters", "Too many calls wait on this connection", message.askId);
        return;
    }
    // Control's own record comes first: the SDK may have missed "asked" before a reconnect
    const requestId = (await waiterRequest(ctx.db, projectId, message.askId)) ?? message.requestId;
    const resumed = requestId === undefined ? undefined : await resume(ctx, projectId, message, requestId);
    await settle(ctx, connection, message, resumed ?? (await place(ctx, projectId, message)));
}

// Heartbeats from calls still waiting, so control and the dashboard know they are alive
export async function beat(ctx: Context, connection: Connection, message: BeatMessage): Promise<void> {
    ctx.registry.beat(connection, message.askIds);
    await beatWaiters(ctx.db, connection.projectId, message.askIds);
}

// The call stopped waiting, for example after its timeout
export async function cancel(ctx: Context, connection: Connection, message: CancelMessage): Promise<void> {
    ctx.registry.drop(connection.projectId, message.askId);
    await finishWaiters(ctx.db, connection.projectId, [message.askId]);
}

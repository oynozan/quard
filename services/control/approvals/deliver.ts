import { claimRequest, decidedRequests, finishWaiters, type RequestDecision } from "@quard/db";
import { APPROVAL_STALE_MS } from "@quard/shared";
import type { Context } from "../server/context.ts";
import type { Waiter } from "../socket/registry.ts";
import { send } from "../socket/send.ts";
import { place, settle } from "./place.ts";

export type Delivery = {
    // Tells the calls waiting here about a decision
    deliver(decision: RequestDecision): Promise<void>;
    // The fallback for missed notifications, over every request with calls waiting here
    check(): Promise<void>;
    // A notification said someone decided this request
    heard(requestId: string): Promise<void>;
};

export function createDelivery(ctx: Context): Delivery {
    // A notification and the check can find the same decision at once
    const busy = new Set<string>();

    async function answer(waiters: Waiter[], decision: RequestDecision): Promise<void> {
        const askIds = waiters.map((waiter) => waiter.ask.askId);
        for (const waiter of waiters) {
            ctx.registry.finish(waiter);
            const { askId } = waiter.ask;
            send(waiter.connection, { type: "decided", askId, answer: decision.answer, requestId: decision.id });
        }
        await finishWaiters(ctx.db, decision.projectId, askIds);
    }

    // Another call ran the "approve once", so this one asks again
    async function reask(waiter: Waiter): Promise<void> {
        const { connection, ask } = waiter;
        const placement = await place(ctx, connection.projectId, ask);
        // It stopped waiting meanwhile
        if (waiter.done) {
            return;
        }
        await settle(ctx, connection, ask, placement);
    }

    // Only one live call runs an approve once, the one that holds it already or else the oldest
    async function once(waiters: Waiter[], decision: RequestDecision): Promise<void> {
        // A call with no recent beat may be gone, so it waits until it beats again
        const since = ctx.now().getTime() - APPROVAL_STALE_MS;
        const live = waiters.filter((waiter) => waiter.beatAt >= since);
        const holder = live.filter((waiter) => waiter.ask.askId === decision.usedBy);
        let tried = false;
        for (const waiter of [...holder, ...live.filter((other) => !holder.includes(other))]) {
            if (waiter.done) {
                continue;
            }
            const runs = !tried && (await claimRequest(ctx.db, decision.projectId, decision.id, waiter.ask.askId));
            tried = true;
            await (runs ? answer([waiter], decision) : reask(waiter));
        }
    }

    async function deliver(decision: RequestDecision): Promise<void> {
        if (busy.has(decision.id)) {
            return;
        }
        busy.add(decision.id);
        try {
            const waiters = ctx.registry.waiting(decision.projectId, decision.id);
            if (decision.answer === "once") {
                await once(waiters, decision);
            } else if (waiters.length > 0) {
                await answer(waiters, decision);
            }
        } catch (error) {
            ctx.log(`control: could not deliver the decision on ${decision.id}: ${(error as Error).message}`);
        } finally {
            busy.delete(decision.id);
        }
    }

    async function deliverAll(requestIds: string[]): Promise<void> {
        if (requestIds.length === 0) {
            return;
        }
        for (const decision of await decidedRequests(ctx.db, requestIds)) {
            await deliver(decision);
        }
    }

    return {
        deliver,
        check: () => deliverAll(ctx.registry.requestIds()),
        heard: (requestId) => deliverAll(ctx.registry.requestIds().filter((id) => id === requestId)),
    };
}

import type { OpenApprovalItem } from "@quard/db";
import { APPROVAL_STALE_MS } from "@quard/shared";
import type { Heartbeat, JoinedCall } from "../types";

type Waiting = Pick<OpenApprovalItem, "runId" | "stepId" | "openedAt" | "waiters">;

const ms = (date: Date) => date.getTime();

// Calls that still wait: not done, with a beat inside the stale limit
function liveWaiters(item: Waiting, now: number) {
    return item.waiters.filter((waiter) => waiter.doneAt === null && now - ms(waiter.lastBeatAt) <= APPROVAL_STALE_MS);
}

// Live while any call still beats. Otherwise the time the last call stopped waiting.
export function heartbeatOf(item: Waiting, now: number): Heartbeat {
    const live = liveWaiters(item, now);
    if (live.length > 0) {
        return { state: "live", lastAt: Math.max(...live.map((waiter) => ms(waiter.lastBeatAt))) };
    }
    const ends = item.waiters.map((waiter) => ms(waiter.doneAt ?? waiter.lastBeatAt));
    return { state: "stopped", lastAt: Math.max(ms(item.openedAt), ...ends) };
}

// The other live calls that wait on this request, besides the call that asked first
export function joinedOf(item: Waiting, now: number): JoinedCall[] {
    return liveWaiters(item, now)
        .filter((waiter) => waiter.runId !== item.runId || waiter.stepId !== item.stepId)
        .map((waiter) => ({
            runId: waiter.runId,
            stepId: waiter.stepId,
            agent: waiter.agent,
            since: ms(waiter.since),
        }));
}

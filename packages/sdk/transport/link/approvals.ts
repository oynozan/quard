import { APPROVAL_BEAT_MS, type ApprovalAnswer, type AskMessage } from "@quard/shared";
import { projectKey } from "../../core/project-key.ts";
import type { Link } from "./link.ts";

// What a call asks a human, built each time it is sent: its arguments' hash
// needs the project's key, which comes with control's ready message
export type Ask = { askId: string; message(key: Buffer): AskMessage };

export type Answer =
    | { kind: "decided"; answer: ApprovalAnswer; requestId?: string; grantId?: string }
    | { kind: "timeout"; requestId?: string }
    // The call was aborted while it waited
    | { kind: "aborted"; requestId?: string }
    // Control could not be reached in time
    | { kind: "down" };

export type Approvals = {
    // Waits for a human's answer, up to the approval guard's timeout or
    // until the signal aborts
    ask(ask: Ask, timeoutMs: number | undefined, signal?: AbortSignal): Promise<Answer>;
    stop(): void;
};

type Waiter = {
    ask: Ask;
    requestId: string | undefined;
    // Runs until control takes the ask, and gives up when it ends
    down: NodeJS.Timeout | undefined;
    // Asks again after control failed to take the ask
    retry: NodeJS.Timeout | undefined;
    finish(answer: Answer): void;
};

const MAX_BEAT = 10_000;
const RETRY_MS = 1_000;

// Calls waiting for a human, with one heartbeat timer and asks resent after reconnects
export function createApprovals(link: Link, downMs: number, beatMs: number = APPROVAL_BEAT_MS): Approvals {
    const waiters = new Map<string, Waiter>();
    let beat: NodeJS.Timeout | undefined;

    function send(waiter: Waiter): void {
        const key = projectKey();
        // Ready brings the key, so it is only missing once forgotten
        if (key === undefined) {
            return;
        }
        const message = waiter.ask.message(key);
        const { requestId } = waiter;
        link.send(requestId === undefined ? message : { ...message, requestId });
    }

    function waitForLink(waiter: Waiter): void {
        waiter.down ??= setTimeout(() => waiter.finish({ kind: "down" }), downMs);
        waiter.down.unref();
    }

    // Control failed to take the ask, so it asks again until downMs passes
    function askAgain(waiter: Waiter): void {
        waitForLink(waiter);
        clearTimeout(waiter.retry);
        waiter.retry = setTimeout(() => {
            if (link.ready()) {
                send(waiter);
            }
        }, RETRY_MS);
        waiter.retry.unref();
    }

    function beatAll(): void {
        const askIds = [...waiters.keys()];
        for (let at = 0; at < askIds.length && link.ready(); at += MAX_BEAT) {
            link.send({ type: "beat", askIds: askIds.slice(at, at + MAX_BEAT) });
        }
    }

    link.listen({
        ready: () => {
            for (const waiter of waiters.values()) {
                clearTimeout(waiter.retry);
                send(waiter);
            }
        },
        down: () => waiters.forEach(waitForLink),
        message: (message) => {
            if (message.type === "asked") {
                const waiter = waiters.get(message.askId);
                if (waiter !== undefined) {
                    waiter.requestId = message.requestId;
                    // Control took the ask, so the call waits with no limit again
                    clearTimeout(waiter.down);
                    waiter.down = undefined;
                }
            } else if (message.type === "decided") {
                const { answer, requestId, grantId } = message;
                const waiter = waiters.get(message.askId);
                waiter?.finish({ kind: "decided", answer, requestId: requestId ?? waiter.requestId, grantId });
            } else if (message.type === "error" && message.id !== undefined) {
                const waiter = waiters.get(message.id);
                if (waiter !== undefined) {
                    askAgain(waiter);
                }
            }
        },
    });

    function ask(asked: Ask, timeoutMs: number | undefined, signal?: AbortSignal): Promise<Answer> {
        return new Promise((resolve) => {
            const release = link.hold();
            let timer: NodeJS.Timeout | undefined;
            // Control drops the request, so no one approves a call that is gone
            const cancel = (answer: Answer) => {
                link.send({ type: "cancel", askId: asked.askId });
                waiter.finish(answer);
            };
            const abort = () => cancel({ kind: "aborted", requestId: waiter.requestId });
            const waiter: Waiter = {
                ask: asked,
                requestId: undefined,
                down: undefined,
                retry: undefined,
                finish: (answer) => {
                    waiters.delete(asked.askId);
                    clearTimeout(waiter.down);
                    clearTimeout(waiter.retry);
                    clearTimeout(timer);
                    signal?.removeEventListener("abort", abort);
                    release();
                    if (waiters.size === 0) {
                        clearInterval(beat);
                        beat = undefined;
                    }
                    resolve(answer);
                },
            };
            waiters.set(asked.askId, waiter);
            beat ??= setInterval(beatAll, beatMs);
            beat.unref();
            if (timeoutMs !== undefined) {
                timer = setTimeout(() => cancel({ kind: "timeout", requestId: waiter.requestId }), timeoutMs);
                timer.unref();
            }
            signal?.addEventListener("abort", abort, { once: true });
            // Control must take the ask in time, even on a live link
            waitForLink(waiter);
            if (link.ready()) {
                send(waiter);
            }
        });
    }

    return {
        ask,
        stop: () => [...waiters.values()].forEach((waiter) => waiter.finish({ kind: "down" })),
    };
}

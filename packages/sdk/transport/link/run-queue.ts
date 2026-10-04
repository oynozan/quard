import { MAX_RUN_COUNTS, newEventId, type RunCountedMessage } from "@quard/shared";
import type { RunState } from "../../context/run.ts";
import { noteRunTotals } from "../../guards/limit/run-counts.ts";
import type { Link } from "./link.ts";
import type { Reply, Requests } from "./requests.ts";

// An addition this process already made to a counter of a shared run
export type RunCount = { counter: string; add: number };

// Run counts control missed, sent when it is back
export type RunReplays = {
    // Sends counts now, or keeps them until control is back
    send(run: RunState, counts: readonly RunCount[]): void;
    keep(run: RunState, counts: readonly RunCount[]): void;
    drop(run: RunState, counts: readonly RunCount[]): void;
};

// The oldest run's counts go first when more runs wait
const MAX_RUNS = 1000;
// How long what is left waits to be sent again while the link stays up
const RETRY_MS = 30_000;

// Control's answer to a run_count of `count` counters, or undefined when
// the reply is not one
export function runCounted(reply: Reply | undefined, count: number): RunCountedMessage | undefined {
    return reply?.type === "run_counted" && reply.used.length === count ? reply : undefined;
}

function chunks(counts: readonly RunCount[]): RunCount[][] {
    const found: RunCount[][] = [];
    for (let at = 0; at < counts.length; at += MAX_RUN_COUNTS) {
        found.push(counts.slice(at, at + MAX_RUN_COUNTS));
    }
    return found;
}

export function createRunReplays(link: Link, requests: Requests, replyMs: number): RunReplays {
    // Counts for the same run and counter add up into one
    const kept = new Map<RunState, Map<string, number>>();
    let retry: NodeJS.Timeout | undefined;

    // A reconnect may never come, so what is kept while ready is sent again later
    function later(): void {
        if (retry === undefined && link.ready()) {
            retry = setTimeout(flush, RETRY_MS);
            retry.unref();
        }
    }

    function keep(run: RunState, counts: readonly RunCount[]): void {
        const known = kept.get(run) ?? new Map<string, number>();
        for (const { counter, add } of counts) {
            known.set(counter, (known.get(counter) ?? 0) + add);
        }
        kept.set(run, known);
        if (kept.size > MAX_RUNS) {
            kept.delete(kept.keys().next().value as RunState);
        }
        later();
    }

    function drop(run: RunState, counts: readonly RunCount[]): void {
        const known = kept.get(run);
        if (known === undefined) {
            return;
        }
        for (const { counter, add } of counts) {
            const left = (known.get(counter) ?? 0) - add;
            if (left > 0) {
                known.set(counter, left);
            } else {
                known.delete(counter);
            }
        }
        if (known.size === 0) {
            kept.delete(run);
        }
    }

    // Replayed counts have no cap, because what they count already happened
    function sendNow(run: RunState, counts: RunCount[]): void {
        const message = { type: "run_count" as const, id: newEventId(), runId: run.runId, counts };
        const late = (reply: Reply | undefined) => {
            const counted = runCounted(reply, counts.length);
            // Control counted them after all, so they are not sent again
            if (counted !== undefined) {
                noteRunTotals(run, counts, counted.used);
                drop(run, counts);
            }
        };
        void requests.request(message, { ms: replyMs, hold: false, late }).then((reply) => {
            const counted = runCounted(reply, counts.length);
            if (counted !== undefined) {
                noteRunTotals(run, counts, counted.used);
            } else {
                keep(run, counts);
            }
        });
    }

    function send(run: RunState, counts: readonly RunCount[]): void {
        chunks(counts).forEach((chunk) => sendNow(run, chunk));
    }

    function flush(): void {
        clearTimeout(retry);
        retry = undefined;
        if (!link.ready()) {
            return;
        }
        const queued = [...kept];
        kept.clear();
        for (const [run, known] of queued) {
            send(
                run,
                [...known].map(([counter, add]) => ({ counter, add })),
            );
        }
    }

    link.listen({ ready: flush });

    return { send: (run, counts) => (link.ready() ? send(run, counts) : keep(run, counts)), keep, drop };
}

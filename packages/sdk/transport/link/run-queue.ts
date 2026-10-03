import { newEventId, type RunCountMessage } from "@quard/shared";
import type { RunState } from "../../context/run.ts";
import { noteRunUsed } from "../../guards/limit/run-counts.ts";
import type { Link } from "./link.ts";
import type { Reply, Requests } from "./requests.ts";

// A count this process already made for a shared run
export type RunCount = { run: RunState; counter: string; add: number };

// Run counts control missed, sent when it is back
export type RunReplays = {
    // Sends a count now, or keeps it until control is back
    send(count: RunCount): void;
    keep(count: RunCount): void;
    drop(count: RunCount): void;
};

// The oldest run's counts go first when more runs wait
const MAX_RUNS = 1000;
// How long what is left waits to be sent again while the link stays up
const RETRY_MS = 30_000;

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

    function keep({ run, counter, add }: RunCount): void {
        const counts = kept.get(run) ?? new Map<string, number>();
        counts.set(counter, (counts.get(counter) ?? 0) + add);
        kept.set(run, counts);
        if (kept.size > MAX_RUNS) {
            kept.delete(kept.keys().next().value as RunState);
        }
        later();
    }

    function drop({ run, counter, add }: RunCount): void {
        const counts = kept.get(run);
        if (counts === undefined) {
            return;
        }
        const left = (counts.get(counter) ?? 0) - add;
        if (left > 0) {
            counts.set(counter, left);
        } else {
            counts.delete(counter);
        }
        if (counts.size === 0) {
            kept.delete(run);
        }
    }

    // Replayed counts have no cap, because what they count already happened
    function sendNow(count: RunCount): void {
        const { run, counter, add } = count;
        const message: RunCountMessage = { type: "run_count", id: newEventId(), runId: run.runId, counter, add };
        const late = (reply: Reply | undefined) => {
            // Control counted it after all, so it is not sent again
            if (reply?.type === "counted") {
                noteRunUsed(run, counter, reply.used);
                drop(count);
            }
        };
        void requests.request(message, { ms: replyMs, hold: false, late }).then((reply) => {
            if (reply?.type === "counted") {
                noteRunUsed(run, counter, reply.used);
            } else {
                keep(count);
            }
        });
    }

    function flush(): void {
        clearTimeout(retry);
        retry = undefined;
        if (!link.ready()) {
            return;
        }
        const queued = [...kept];
        kept.clear();
        for (const [run, counts] of queued) {
            for (const [counter, add] of counts) {
                sendNow({ run, counter, add });
            }
        }
    }

    link.listen({ ready: flush });

    return { send: (count) => (link.ready() ? sendNow(count) : keep(count)), keep, drop };
}

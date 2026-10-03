import { newEventId, type FleetMessage } from "@quard/shared";
import { noteDayUsed } from "../../guards/limit/daily.ts";
import type { Link } from "./link.ts";
import type { Reply, Requests } from "./requests.ts";

export type FleetUse = Omit<FleetMessage, "type" | "id">;
export type QueuedCount = { day: string; tool: string; counter: string; add: number };

// What control missed while it was away, sent when it is back
export type Replays = {
    // Sends a fleet report now, or keeps it until control is back
    use(use: FleetUse): void;
    keepUse(use: FleetUse): void;
    dropUse(use: FleetUse): void;
    keepCount(count: QueuedCount): void;
    dropCount(count: QueuedCount): void;
};

const MAX_USES = 1000;
// How long what is left waits to be sent again while the link stays up
const RETRY_MS = 30_000;

export function createReplays(link: Link, requests: Requests, replyMs: number): Replays {
    // Counts for the same day, tool and counter add up into one
    const counts = new Map<string, number>();
    const uses: FleetUse[] = [];
    let retry: NodeJS.Timeout | undefined;

    const keyOf = (count: QueuedCount) => JSON.stringify([count.day, count.tool, count.counter]);

    // A reconnect may never come, so what is kept while ready is sent again later
    function later(): void {
        if (retry === undefined && link.ready()) {
            retry = setTimeout(flush, RETRY_MS);
            retry.unref();
        }
    }

    function keepCount(count: QueuedCount): void {
        counts.set(keyOf(count), (counts.get(keyOf(count)) ?? 0) + count.add);
        later();
    }

    function dropCount(count: QueuedCount): void {
        const left = (counts.get(keyOf(count)) ?? 0) - count.add;
        if (left > 0) {
            counts.set(keyOf(count), left);
        } else {
            counts.delete(keyOf(count));
        }
    }

    function keepUse(use: FleetUse): void {
        uses.push(use);
        if (uses.length > MAX_USES) {
            uses.shift();
        }
        later();
    }

    function dropUse(use: FleetUse): void {
        const at = uses.indexOf(use);
        if (at !== -1) {
            uses.splice(at, 1);
        }
    }

    function sendUse(use: FleetUse): void {
        // A late answer means control has the report after all
        const late = (reply: Reply | undefined) => {
            if (reply !== undefined) {
                dropUse(use);
            }
        };
        void requests
            .request({ type: "fleet", id: newEventId(), ...use }, { ms: replyMs, hold: false, late })
            .then((reply) => {
                if (reply === undefined) {
                    keepUse(use);
                }
            });
    }

    // Replayed counts have no cap, because the calls already ran
    function sendCount(count: QueuedCount): void {
        const { day, tool, counter, add } = count;
        const message = { type: "count", id: newEventId(), tool, counter, day, add } as const;
        const late = (reply: Reply | undefined) => {
            // Control counted it after all, so it is not sent again
            if (reply?.type === "counted") {
                noteDayUsed(day, tool, counter, reply.used);
                dropCount(count);
            }
        };
        void requests.request(message, { ms: replyMs, hold: false, late }).then((reply) => {
            if (reply?.type === "counted") {
                noteDayUsed(day, tool, counter, reply.used);
            } else {
                keepCount(count);
            }
        });
    }

    function flush(): void {
        clearTimeout(retry);
        retry = undefined;
        if (!link.ready()) {
            return;
        }
        const queued = [...counts];
        counts.clear();
        for (const [key, add] of queued) {
            const [day, tool, counter] = JSON.parse(key) as [string, string, string];
            sendCount({ day, tool, counter, add });
        }
        uses.splice(0).forEach(sendUse);
    }

    link.listen({ ready: flush });

    return { use: (use) => (link.ready() ? sendUse(use) : keepUse(use)), keepUse, dropUse, keepCount, dropCount };
}

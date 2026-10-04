import {
    newEventId,
    type CountedMessage,
    type CountMessage,
    type FleetMessage,
    type UncountMessage,
} from "@quard/shared";
import { noteDayUsed } from "../../guards/limit/daily.ts";
import type { Link } from "./link.ts";
import type { Reply, Requests } from "./requests.ts";

export type FleetUse = Omit<FleetMessage, "type" | "id">;
export type QueuedCount = { day: string; tool: string; counter: string; add: number };
export type TakenCount = { counter: string; add: number };

// What control missed while it was away, sent when it is back
export type Replays = {
    // Sends a fleet report now, or keeps it until control is back
    use(use: FleetUse): void;
    keepUse(use: FleetUse): void;
    dropUse(use: FleetUse): void;
    keepCount(count: QueuedCount): void;
    dropCount(count: QueuedCount): void;
    // Takes counts of one tool and day back from control, now or once it is back
    takeBack(day: string, tool: string, counts: readonly TakenCount[]): void;
};

const MAX_USES = 1000;
// How long what is left waits to be sent again while the link stays up
const RETRY_MS = 30_000;

// Control's answer to a count of `count` counters, or undefined when the reply is not one
export function dayCounted(reply: Reply | undefined, count: number): CountedMessage | undefined {
    return reply?.type === "counted" && reply.used.length === count ? reply : undefined;
}

export function createReplays(link: Link, requests: Requests, replyMs: number): Replays {
    // What control misses on each counter, below zero when it has counts to give back
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

    function owe(count: QueuedCount): void {
        const left = (counts.get(keyOf(count)) ?? 0) + count.add;
        if (left === 0) {
            counts.delete(keyOf(count));
        } else {
            counts.set(keyOf(count), left);
            later();
        }
    }

    function keepCount(count: QueuedCount): void {
        owe(count);
    }

    function dropCount(count: QueuedCount): void {
        owe({ ...count, add: -count.add });
    }

    function takeBack(day: string, tool: string, taken: readonly TakenCount[]): void {
        const back = taken.map(({ counter, add }) => ({ counter, add }));
        const message: UncountMessage = { type: "uncount", id: newEventId(), tool, day, counts: back };
        if (!link.send(message)) {
            taken.forEach(({ counter, add }) => dropCount({ day, tool, counter, add }));
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
        const message: CountMessage = { type: "count", id: newEventId(), tool, day, counts: [{ counter, add }] };
        const late = (reply: Reply | undefined) => {
            const counted = dayCounted(reply, 1);
            // Control counted it after all, so it is not sent again
            if (counted !== undefined) {
                noteDayUsed(day, tool, counter, counted.used[0] as number);
                dropCount(count);
            }
        };
        void requests.request(message, { ms: replyMs, hold: false, late }).then((reply) => {
            const counted = dayCounted(reply, 1);
            if (counted !== undefined) {
                noteDayUsed(day, tool, counter, counted.used[0] as number);
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
            if (add > 0) {
                sendCount({ day, tool, counter, add });
            } else {
                takeBack(day, tool, [{ counter, add: -add }]);
            }
        }
        uses.splice(0).forEach(sendUse);
    }

    link.listen({ ready: flush });

    return {
        use: (use) => (link.ready() ? sendUse(use) : keepUse(use)),
        keepUse,
        dropUse,
        keepCount,
        dropCount,
        takeBack,
    };
}

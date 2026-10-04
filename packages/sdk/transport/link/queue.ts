import {
    newEventId,
    type CountedMessage,
    type CountMessage,
    type FleetMessage,
    type UncountMessage,
} from "@quard/shared";
import { projectRedactor } from "../../core/project-key.ts";
import { dayEntry, noteDayUsed } from "../../guards/limit/daily.ts";
import { hashedValues } from "../../guards/limit/fleet.ts";
import type { Link } from "./link.ts";
import type { Reply, Requests } from "./requests.ts";

// A fleet report as this process keeps it, its values' keys still plain
export type FleetUse = Omit<FleetMessage, "type" | "id">;
export type QueuedCount = { day: string; tool: string; counter: string; add: number };
export type TakenCount = { counter: string; add: number };
type Named = { counter: string };
type DayCounter = Omit<QueuedCount, "add">;

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
    // For a count sent now, notes control's totals less what goes back to it after
    noteLater(day: string, tool: string, counters: readonly Named[]): (used: readonly number[]) => void;
};

const MAX_USES = 1000;
// How long what is left waits to be sent again while the link stays up
const RETRY_MS = 30_000;

// The report as control takes it, hashed with the project's key. Undefined
// while the key is unknown.
export function fleetMessage(use: FleetUse): FleetMessage | undefined {
    const redactor = projectRedactor();
    return redactor === undefined
        ? undefined
        : { type: "fleet", id: newEventId(), ...use, values: hashedValues(use.values, redactor) };
}

// Control's answer to a count of `count` counters, or undefined when the reply is not one
export function dayCounted(reply: Reply | undefined, count: number): CountedMessage | undefined {
    return reply?.type === "counted" && reply.used.length === count ? reply : undefined;
}

export function createReplays(link: Link, requests: Requests, replyMs: number): Replays {
    // What control misses on each counter, below zero when it has counts to give back
    const counts = new Map<string, number>();
    // What went back to control on each counter, by day
    const sentBack = new Map<string, Map<string, number>>();
    const uses: FleetUse[] = [];
    let retry: NodeJS.Timeout | undefined;

    const keyOf = (count: DayCounter) => JSON.stringify([count.day, count.tool, count.counter]);
    const sentSoFar = (count: DayCounter) => sentBack.get(count.day)?.get(keyOf(count)) ?? 0;

    // Notes control's total less what went back since mark and what still waits to go back
    function noteTotal(count: DayCounter, used: number, mark: number): void {
        const waiting = Math.max(0, -(counts.get(keyOf(count)) ?? 0));
        noteDayUsed(count.day, count.tool, count.counter, used - (sentSoFar(count) - mark) - waiting);
    }

    function noteLater(day: string, tool: string, counters: readonly Named[]) {
        const named = counters.map(({ counter }) => ({ day, tool, counter }));
        const marks = named.map(sentSoFar);
        return (used: readonly number[]) => {
            named.forEach((count, index) => noteTotal(count, used[index] as number, marks[index] as number));
        };
    }

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
            return;
        }
        const sums = dayEntry(sentBack, day);
        for (const { counter, add } of back) {
            const key = keyOf({ day, tool, counter });
            sums.set(key, (sums.get(key) ?? 0) + add);
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
        const message = fleetMessage(use);
        // Ready brings the key, so it is only missing once forgotten
        if (message === undefined) {
            keepUse(use);
            return;
        }
        // A late answer means control has the report after all
        const late = (reply: Reply | undefined) => {
            if (reply !== undefined) {
                dropUse(use);
            }
        };
        void requests.request(message, { ms: replyMs, hold: false, late }).then((reply) => {
            if (reply === undefined) {
                keepUse(use);
            }
        });
    }

    // Replayed counts have no cap, because the calls already ran
    function sendCount(count: QueuedCount): void {
        const { day, tool, counter, add } = count;
        const message: CountMessage = { type: "count", id: newEventId(), tool, day, counts: [{ counter, add }] };
        const noteTotals = noteLater(day, tool, [count]);
        const late = (reply: Reply | undefined) => {
            const counted = dayCounted(reply, 1);
            // Control counted it after all, so it is not sent again
            if (counted !== undefined) {
                dropCount(count);
                noteTotals(counted.used);
            }
        };
        void requests.request(message, { ms: replyMs, hold: false, late }).then((reply) => {
            const counted = dayCounted(reply, 1);
            if (counted !== undefined) {
                noteTotals(counted.used);
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

    link.listen({
        ready: (message) => {
            // Control's totals at connect still hold what waits here to go back
            for (const count of message.counters) {
                noteTotal(count, count.used, sentSoFar(count));
            }
            flush();
        },
    });

    return {
        use: (use) => (link.ready() ? sendUse(use) : keepUse(use)),
        keepUse,
        dropUse,
        keepCount,
        dropCount,
        takeBack,
        noteLater,
    };
}

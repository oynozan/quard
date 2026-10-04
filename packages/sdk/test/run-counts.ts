import type { RunCountedMessage, RunCountMessage } from "@quard/shared";

// Adds a run_count to `totals` the way control does: all of its counts,
// or none when one would pass its max. `key` names a counter in totals.
export function countRun(
    totals: Map<string, number>,
    message: RunCountMessage,
    key: (counter: string) => string = (counter) => counter,
): RunCountedMessage {
    const before = message.counts.map(({ counter }) => totals.get(key(counter)) ?? 0);
    const after = new Map(totals);
    const ok = message.counts.every(({ counter, add, max }) => {
        const total = (after.get(key(counter)) ?? 0) + add;
        after.set(key(counter), total);
        return max === undefined || total <= max;
    });
    if (!ok) {
        return { type: "run_counted", id: message.id, ok, used: before };
    }
    const used = message.counts.map(({ counter, add }) => {
        const total = (totals.get(key(counter)) ?? 0) + add;
        totals.set(key(counter), total);
        return total;
    });
    return { type: "run_counted", id: message.id, ok, used };
}

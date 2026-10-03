import type { BucketRange, RosterWindow, TimeRange } from "@quard/db";
import { DAY, HOUR, MINUTE } from "@/lib/time";
import { IDLE_MS } from "../runs/live/status";

export const HERO_BUCKETS = 144;
export const RUN_HOURS = 24;
// UTC days, today included
export const RATE_DAYS = 30;

const BUCKET = 10 * MINUTE;
const ROSTER_DAYS = 30;

export type OverviewWindows = {
    activity: BucketRange;
    runs: BucketRange;
    lastDay: TimeRange;
    rateDays: TimeRange;
    roster: RosterWindow;
};

// The end of the slot that holds now, so a chart ending there has round labels
function slotEnd(now: number, size: number): number {
    return Math.floor(now / size) * size + size;
}

const at = (time: number) => new Date(time);

// Every window the overview reads, from one request time
export function windowsAt(now: number): OverviewWindows {
    const heroEnd = slotEnd(now, BUCKET);
    const hourEnd = slotEnd(now, HOUR);
    const today = Math.floor(now / DAY) * DAY;
    return {
        activity: { since: at(heroEnd - HERO_BUCKETS * BUCKET), until: at(heroEnd), bucketMs: BUCKET },
        runs: { since: at(hourEnd - RUN_HOURS * HOUR), until: at(hourEnd), bucketMs: HOUR },
        lastDay: { since: at(now - DAY), until: at(now) },
        rateDays: { since: at(today - (RATE_DAYS - 1) * DAY), until: at(now) },
        roster: { since: at(now - ROSTER_DAYS * DAY), dayAgo: at(now - DAY), idleSince: at(now - IDLE_MS) },
    };
}

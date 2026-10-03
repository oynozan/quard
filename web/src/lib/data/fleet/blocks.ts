import type { GuardBlockHour } from "@quard/db";
import { DAY, HOUR } from "@/lib/time";
import type { GuardType } from "../types";
import type { BlocksByGuard, BlocksHeatmap } from "./types";

// Thirty UTC days, today included
export const WINDOW_DAYS = 30;

// The guards the summary shows, in the order its filter lists them
const GUARDS: GuardType[] = ["source", "action", "egress", "limit", "approval", "permission"];

const zeros = (length: number): number[] => Array.from({ length }, () => 0);

// UTC midnight of the window's first day, for a window that ends at now
export function windowStart(now: number): number {
    return Math.floor(now / DAY) * DAY - (WINDOW_DAYS - 1) * DAY;
}

// Daily blocks per guard and blocks per UTC weekday and hour, from hourly counts
export function blocksOf(rows: GuardBlockHour[], startAt: number): { byGuard: BlocksByGuard; heatmap: BlocksHeatmap } {
    const series = GUARDS.map((guard) => ({ guard, values: zeros(WINDOW_DAYS), total: 0 }));
    const totals = zeros(WINDOW_DAYS);
    const values = Array.from({ length: 7 }, () => zeros(24));
    for (const { guard, hour, blocks } of rows) {
        const row = series.find((item) => item.guard === guard);
        const day = Math.floor((hour * HOUR - startAt) / DAY);
        // Skips guards the summary does not show, such as signature, and hours outside the window
        if (!row || day < 0 || day >= WINDOW_DAYS) continue;
        row.values[day] += blocks;
        row.total += blocks;
        totals[day] += blocks;
        // 1 Jan 1970 was a Thursday, so Monday is 0
        values[(Math.floor(hour / 24) + 3) % 7][hour % 24] += blocks;
    }
    const hourTotals = zeros(24).map((_, hour) => values.reduce((sum, day) => sum + day[hour], 0));
    return {
        byGuard: { startAt, series, totals },
        heatmap: { values, hourTotals, total: totals.reduce((sum, value) => sum + value, 0) },
    };
}

import { blockRatePerDay, BLOCK_RATE_START } from "../activity";
import { createRng, NOW, DAY } from "../rng";
import { allocateParts } from "./allocate";
import type { GuardType } from "../types";
import type { BlocksByGuard, BlocksHeatmap } from "./types";

const GUARDS: GuardType[] = ["source", "action", "egress", "limit", "approval"];
const SHARES = [0.31, 0.17, 0.21, 0.27, 0.04];
// On the spike day most extra blocks were hidden text in fetched pages and egress.
const SPIKE_SHARES = [0.44, 0.12, 0.27, 0.15, 0.02];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Decisions per day: about 5,000 on a weekday, fewer at weekends.
const WEEKDAY_DECISIONS = 5_040;

// UTC hours, busiest in European and US working hours.
const HOUR_WEIGHTS = [1, 1, 1, 1, 1, 2, 3, 5, 8, 10, 11, 11, 10, 11, 12, 12, 11, 9, 7, 5, 4, 3, 2, 1];

function weekdayIndex(time: number): number {
    // 1 Jan 1970 was a Thursday. Monday is 0.
    return (Math.floor(time / DAY) + 3) % 7;
}

let cached: { byGuard: BlocksByGuard; heatmap: BlocksHeatmap } | null = null;

// Blocks per guard type per day, matching the overview's block-rate series.
export function blockSeries(): { byGuard: BlocksByGuard; heatmap: BlocksHeatmap } {
    if (cached) return cached;
    const rng = createRng(2203);
    const rates = blockRatePerDay();
    const totals: number[] = [];
    const series = GUARDS.map((guard) => ({ guard, values: [] as number[], total: 0 }));
    const values = DAYS.map(() => Array.from({ length: 24 }, () => 0));

    rates.forEach((rate, day) => {
        const start = BLOCK_RATE_START + day * DAY;
        const weekday = weekdayIndex(start);
        const decisions = WEEKDAY_DECISIONS * (weekday >= 5 ? 0.55 : 1) * (0.94 + rng() * 0.12);
        const blocks = Math.round((decisions * rate) / 100);
        totals.push(blocks);
        const shares = (rate > 2 ? SPIKE_SHARES : SHARES).map((share) => share * (0.85 + rng() * 0.3));
        allocateParts(shares, blocks).forEach((count, index) => {
            series[index].values.push(count);
            series[index].total += count;
        });
        // Today only has the hours up to now.
        const lastHour = day === rates.length - 1 ? new Date(NOW).getUTCHours() : 23;
        const weights = HOUR_WEIGHTS.map((weight, hour) => (hour > lastHour ? 0 : weight * (0.7 + rng() * 0.6)));
        allocateParts(weights, blocks).forEach((count, hour) => (values[weekday][hour] += count));
    });

    const hourTotals = Array.from({ length: 24 }, (_, hour) => values.reduce((sum, row) => sum + row[hour], 0));
    cached = {
        byGuard: { startAt: BLOCK_RATE_START, series, totals },
        heatmap: {
            days: DAYS,
            values,
            hourTotals,
            max: Math.max(...values.flat()),
            total: totals.reduce((sum, value) => sum + value, 0),
        },
    };
    return cached;
}

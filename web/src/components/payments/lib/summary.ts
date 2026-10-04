import type { BarItem } from "@/components/charts/cell-bars";
import type { SpendItem } from "@/lib/data/payments/types";
import { formatCost, formatShortDate } from "@/lib/format";
import { DAY } from "@/lib/time";
import { peakIndex, sum } from "@/components/fleet/lib/charts";
import { shortAddress } from "./words";

// Bars for spend with a known USD value, biggest first; payees are shortened
export function spendBars(items: SpendItem[], short = false): BarItem[] {
    return items
        .filter((item) => item.usd > 0)
        .sort((a, b) => b.usd - a.usd)
        .map((item) => ({ label: short ? shortAddress(item.label) : item.label, value: item.usd }));
}

export function daySummary(values: number[], startAt: number): string {
    if (sum(values) === 0) return "x402 spend per day: none in the last 30 days.";
    const peak = peakIndex(values);
    const day = formatShortDate(startAt + peak * DAY);
    return `x402 spend per day over the last 30 days. Peak ${formatCost(values[peak])} on ${day}, ${formatCost(values[values.length - 1])} today.`;
}

export function barsSummary(what: string, items: BarItem[]): string {
    if (items.length === 0) return `${what}: none in the last 30 days.`;
    return `${what} over the last 30 days. ${items[0].label} leads with ${formatCost(items[0].value)}, out of ${items.length}.`;
}

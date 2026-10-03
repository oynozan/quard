import type { HeatSteps } from "@/components/charts/layout/heatmap";
import type { BarItem } from "@/components/charts/cell-bars";
import type { BlocksHeatmap } from "@/lib/data/fleet";
import type { GuardType } from "@/lib/data/types";
import { DAY } from "@/lib/data/rng";
import { formatInt, formatShortDate } from "@/lib/format";

export const GUARD_NAMES: Record<GuardType, string> = {
    source: "Source",
    action: "Action",
    egress: "Egress",
    limit: "Limit",
    approval: "Approval",
    permission: "Permission",
};

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (hour: number) => String(hour).padStart(2, "0");

export const HOURS = Array.from({ length: 24 }, (_, hour) => pad(hour));
export const HOUR_CAPTIONS = HOURS.map((hour, index) => `${hour}:00–${pad((index + 1) % 24)}:00`);
export const HOUR_AXIS = [0, 6, 12, 18, 23];

// Fixed bins for blocks per hour slot, summed over 30 days
export const BLOCK_HEAT_STEPS: HeatSteps = [1, 6, 12, 20, 30];

export function sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

export function peakIndex(values: number[]): number {
    return values.reduce((best, value, index) => (value > values[best] ? index : best), 0);
}

export function dailySummary(what: string, values: number[], startAt: number): string {
    if (!values.length) return `${what} per day over the last 30 days. No data yet.`;
    const peak = peakIndex(values);
    const peakDay = formatShortDate(startAt + peak * DAY);
    const today = values[values.length - 1];
    return `${what} per day over the last 30 days. Peak ${formatInt(values[peak])} on ${peakDay}, ${formatInt(today)} today.`;
}

export function heatSummary(heatmap: BlocksHeatmap): string {
    const busiest = peakIndex(heatmap.hourTotals);
    return `Blocks by weekday and UTC hour over the last 30 days, ${formatInt(heatmap.total)} in total. Busiest hour ${HOUR_CAPTIONS[busiest]}.`;
}

export function barsSummary(what: string, items: BarItem[], unit: string): string {
    if (!items.length) return `${what}: none in the last 30 days.`;
    const top = items[0];
    return `${what} over the last 30 days. ${top.label} leads with ${formatInt(top.value)} ${unit}, out of ${items.length}.`;
}

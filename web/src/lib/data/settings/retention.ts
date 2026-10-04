import { RETENTION } from "@quard/db";
import type { RetentionRow } from "./types";

// "1 year" for 365 days, otherwise "30 days" or "1 day"
function keepFor(days: number): string {
    if (days % 365 === 0) return `${days / 365} ${days === 365 ? "year" : "years"}`;
    return `${days} ${days === 1 ? "day" : "days"}`;
}

function kept(item: string, days: number): RetentionRow {
    return { item, keep: keepFor(days), days };
}

// The windows the worker's cleanup uses, and "Redaction" for approval arguments
export const KEPT_FOR: RetentionRow[] = [
    kept("Runs tied to an incident", RETENTION.incidentDays),
    { item: "Memory labels", keep: "Kept", days: null },
    kept("Fleet first-seen index", RETENTION.fleetDays),
    { item: "Approval arguments", keep: "Until decided", days: null },
];

// Runs come first, kept for the project's own number of days
export function retentionRows(days: number): RetentionRow[] {
    return [kept("Runs", days), ...KEPT_FOR];
}

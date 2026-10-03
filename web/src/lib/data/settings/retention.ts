import type { RetentionRow } from "./types";

// Product rules from PROJECT.md "Retention", and "Redaction" for approval arguments
export const KEPT_FOR: RetentionRow[] = [
    { item: "Runs tied to an incident", keep: "1 year", days: 365 },
    { item: "Memory labels", keep: "Kept", days: null },
    { item: "Fleet first-seen index", keep: "1 year", days: 365 },
    { item: "Approval arguments", keep: "Until decided", days: null },
];

// Runs come first, kept for the project's own number of days
export function retentionRows(days: number): RetentionRow[] {
    return [{ item: "Runs", keep: `${days} ${days === 1 ? "day" : "days"}`, days }, ...KEPT_FOR];
}

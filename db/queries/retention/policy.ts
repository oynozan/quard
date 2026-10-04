// How long Quard keeps data (PROJECT.md "Retention"). Runs are kept for
// the project's retention_days, 30 unless the row was edited.
export const RETENTION = {
    // A run tied to an incident is kept this long after the incident opened
    incidentDays: 365,
    // A fleet value is forgotten this long after its last use
    fleetDays: 365,
    // Closed SDK connections, so the settings page lists offline apps
    connectionDays: 30,
    // Per-day limit counters are only read on their own day
    dayCounterDays: 2,
} as const;

// Rows each delete removes at most, so no statement holds locks for long.
// A run takes its steps, events and labels with it, so its batch is smaller.
export const BATCH = { runs: 100, rows: 1_000 } as const;

const DAY_MS = 24 * 60 * 60_000;

export function daysAgo(now: Date, days: number): Date {
    return new Date(now.getTime() - days * DAY_MS);
}

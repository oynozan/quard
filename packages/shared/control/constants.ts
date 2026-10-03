// Waiting calls send a beat this often. A request with no beat for
// APPROVAL_STALE_MS shows as "no longer waiting" in the dashboard.
export const APPROVAL_BEAT_MS = 15_000;
export const APPROVAL_STALE_MS = 45_000;

// The fleet check (PROJECT.md, Q9)
export const FLEET_CHECK = {
    // A value first seen this recently counts as new
    newForDays: 7,
    // A new value used by this many separate runs within the window
    // below is quarantined
    runsToBlock: 5,
    withinHours: 24,
    // With no history yet, the check only observes for its first days
    observeDays: 7,
} as const;

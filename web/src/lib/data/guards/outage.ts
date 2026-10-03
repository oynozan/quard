import { NOW, MINUTE, HOUR } from "../rng";

// A short window when control and webhook were unreachable, PROJECT.md "When the backend is down".
// Decision records were buffered and sent late with degraded: true.
// Asks could not reach a person, so they blocked after 30 s with backend_unavailable.
export const BACKEND_OUTAGE = {
    from: NOW - 3 * HOUR - 18 * MINUTE,
    to: NOW - 3 * HOUR - 6 * MINUTE,
    note: "control was unreachable for 12 minutes; decision records were buffered and sent late",
};

export function inOutage(time: number): boolean {
    return time >= BACKEND_OUTAGE.from && time < BACKEND_OUTAGE.to;
}

export const OUTAGE_REASON = "backend_unavailable: no approver could be reached for 30 s";

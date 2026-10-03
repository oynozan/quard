import { DAY, HOUR } from "@/lib/time";
import { IDLE_MS } from "../../runs/live/status";

// The graph, the roster and an agent's links look back this far
export const WINDOW_DAYS = 30;

// The roster's windows, counted back from now
export function rosterWindow(now: number): { since: Date; dayAgo: Date; idleSince: Date } {
    return {
        since: new Date(now - WINDOW_DAYS * DAY),
        dayAgo: new Date(now - DAY),
        idleSince: new Date(now - IDLE_MS),
    };
}

// 24 whole hours, the last of them holding now
export function hoursWindow(now: number): { since: Date; until: Date } {
    const until = Math.floor(now / HOUR) * HOUR + HOUR;
    return { since: new Date(until - 24 * HOUR), until: new Date(until) };
}

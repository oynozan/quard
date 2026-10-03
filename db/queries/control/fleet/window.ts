import { FLEET_CHECK } from "@quard/shared";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function hoursBefore(now: Date, hours: number): Date {
    return new Date(now.getTime() - hours * HOUR);
}

export function daysBefore(now: Date, days: number): Date {
    return new Date(now.getTime() - days * DAY);
}

// The fleet check only observes for its first days in a project
export function observeEnd(startedAt: Date): Date {
    return new Date(startedAt.getTime() + FLEET_CHECK.observeDays * DAY);
}

import { createRng, NOW, DAY } from "./rng";

const TAU = 2 * Math.PI;

// Model calls per 10 minutes over the last 24 hours, oldest first.
export function modelCallsPer10Min(): number[] {
    const rng = createRng(42);
    return Array.from({ length: 144 }, (_, i) => {
        const hour = i / 6;
        const base = 46 + 38 * Math.sin(((hour - 9) / 24) * TAU);
        const burst = i >= 88 && i < 94 ? 64 : i >= 118 && i < 121 ? 42 : 0;
        return Math.max(0, Math.round(base + burst + rng() * 18 - 9));
    });
}

// Runs started per hour over the last 24 hours, oldest first.
export function runsPerHour(): number[] {
    const rng = createRng(7);
    return Array.from({ length: 24 }, (_, h) => Math.round(42 + 30 * Math.sin(((h - 10) / 24) * TAU) + rng() * 12));
}

// Share of guarded calls that were blocked, per day over 30 days, in percent.
export function blockRatePerDay(): number[] {
    const rng = createRng(11);
    return Array.from({ length: 30 }, (_, i) => {
        const value = 0.9 + 0.35 * Math.sin(i / 4) + (i === 21 ? 1.75 : 0) + rng() * 0.3;
        return Math.round(value * 100) / 100;
    });
}

// The first day of the 30-day series.
export const BLOCK_RATE_START = NOW - 29 * DAY;

import { MINUTE, HOUR, DAY } from "@/lib/time";
import type { GuardMode, Outcome } from "@/lib/data/types";

// A fixed locale and zone so the server and the browser print the same string.
const INT = new Intl.NumberFormat("en-US");
const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const CLOCK_SECONDS = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
});
const SHORT_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const LONG_DATE = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" });

export function formatInt(value: number): string {
    return INT.format(value);
}

export function formatCompact(value: number): string {
    return COMPACT.format(value);
}

export function formatUsd(value: number): string {
    return USD.format(value);
}

export function formatPercent(value: number, digits = 2): string {
    return `${value.toFixed(digits)}%`;
}

export function formatClock(time: number, seconds = false): string {
    return (seconds ? CLOCK_SECONDS : CLOCK).format(time);
}

export function formatShortDate(time: number): string {
    return SHORT_DATE.format(time);
}

export function formatLongDate(time: number): string {
    return LONG_DATE.format(time);
}

// "4 min", "3 h", "2 d". Counted against the given now.
export function formatAge(time: number, now: number): string {
    const elapsed = Math.max(0, now - time);
    if (elapsed < HOUR) return `${Math.max(1, Math.round(elapsed / MINUTE))} min`;
    if (elapsed < DAY) return `${Math.round(elapsed / HOUR)} h`;
    return `${Math.round(elapsed / DAY)} d`;
}

export function formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ${seconds % 60} s`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// Run and step ids are long hex strings; the first 8 characters are enough to tell them apart.
export function shortId(id: string): string {
    return id.slice(0, 8);
}

export function padCount(value: number): string {
    return value.toString().padStart(2, "0");
}

// Step durations: "18 ms", "1.4 s", then seconds and minutes.
export function formatStepDuration(ms: number): string {
    if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
    if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
    return formatDuration(ms);
}

// Model calls often cost less than a cent: "$0.0042".
export function formatCost(usd: number): string {
    if (usd > 0 && usd < 0.01) return `$${usd.toFixed(4)}`;
    return formatUsd(usd);
}

// "p = 0.004", or "p < 0.001" for very small values.
export function formatPValue(p: number): string {
    return p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`;
}

// A share from 0 to 1 as a whole percent: "42%".
export function formatShare(share: number): string {
    return `${Math.round(share * 100)}%`;
}

const OUTCOME_WORD: Record<Outcome, string> = {
    allow: "Allowed",
    ask: "Asked",
    block: "Blocked",
    pass: "Passed",
    strip: "Stripped",
    flag: "Flagged",
};

const WOULD_WORD: Record<Outcome, string> = {
    allow: "Allowed",
    ask: "Would ask",
    block: "Would block",
    pass: "Passed",
    strip: "Would strip",
    flag: "Would flag",
};

// Observe-mode results say what the rule would have done: "Would block".
export function formatOutcome(outcome: Outcome, mode: GuardMode | null = "block"): string {
    return mode === "observe" ? WOULD_WORD[outcome] : OUTCOME_WORD[outcome];
}

// Hashes show their first 12 characters.
export function shortHash(hash: string): string {
    return hash.slice(0, 12);
}

import type { IncidentCategory, PathRole, ReplayStatus } from "@/lib/data/types";

export type Tone = "on" | "off" | "context" | "warning" | "danger";

// Shared with the overview, so a status reads the same everywhere
export const REPLAY_TONE: Record<ReplayStatus, Tone> = {
    running: "on",
    confirmed: "danger",
    "not confirmed": "context",
    "could not reproduce": "context",
};

export const REPLAY_WORD: Record<ReplayStatus, string> = {
    running: "Replaying",
    confirmed: "Confirmed",
    "not confirmed": "Not confirmed",
    "could not reproduce": "Could not reproduce",
};

export const CATEGORIES: IncidentCategory[] = [
    "bad input",
    "bad reasoning",
    "bad handoff",
    "broken tool",
    "missing guard",
];

export const ROLE_WORD: Record<PathRole, string> = {
    entry: "Entry point",
    carry: "Handoff",
    turning: "Turning point",
    damage: "Damage",
};

export function sentenceCase(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

// Costs here are cents or less, so keep up to 4 decimals.
export function formatCost(value: number): string {
    const digits = value < 0.1 ? 4 : 2;
    return `$${value.toFixed(digits)}`;
}

export function formatP(value: number): string {
    return value < 0.0001 ? "<0.0001" : value.toFixed(4);
}

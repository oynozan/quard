import type { Label } from "@/lib/data/types";

export type ContextKey = "trusted-public" | "trusted-internal" | "untrusted-public" | "untrusted-internal";

export type ContextStyle = { key: ContextKey; word: string; fill: string; untrusted: boolean };

// Checked with the dataviz validator against the chart field: all pairs pass
// CVD (worst 11.1, deutan) and normal vision (worst 16.8). Untrusted cells also
// carry a hole, so trust never rests on color alone.
export const CONTEXTS: ContextStyle[] = [
    { key: "trusted-public", word: "Trusted public", fill: "var(--chart-context)", untrusted: false },
    { key: "trusted-internal", word: "Trusted internal", fill: "var(--cat-4)", untrusted: false },
    { key: "untrusted-public", word: "Untrusted public", fill: "var(--caution-text)", untrusted: true },
    { key: "untrusted-internal", word: "Untrusted internal", fill: "var(--cat-3)", untrusted: true },
];

export function contextKey(label: Label): ContextKey {
    return `${label.trust}-${label.sensitivity}`;
}

export function contextStyle(label: Label): ContextStyle {
    const key = contextKey(label);
    return CONTEXTS.find((context) => context.key === key) ?? CONTEXTS[0];
}

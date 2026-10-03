import type { ContextLabel, Label } from "./types.ts";

export function combineLabels(labels: readonly Label[]): ContextLabel {
    return {
        trust: labels.some((label) => label.trust === "untrusted") ? "untrusted" : "trusted",
        sensitivity: labels.some((label) => label.sensitivity === "internal") ? "internal" : "public",
        origins: [...new Set(labels.map((label) => label.origin))],
        flagged: labels.some((label) => label.flags.length > 0),
    };
}

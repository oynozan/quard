import type { Label } from "../types";

// The label of a call before the model has read anything.
export const EMPTY_CONTEXT: Label = { origin: "instructions", trust: "trusted", sensitivity: "public" };

// Keeps the first label per origin, in order.
export function uniqueLabels(labels: Label[]): Label[] {
    const seen = new Set<string>();
    return labels.filter((label) => {
        if (seen.has(label.origin)) return false;
        seen.add(label.origin);
        return true;
    });
}

// The least trusted and most sensitive label among everything read.
// Its origin is the content that made it untrusted, or else the most sensitive one.
export function contextOf(read: Label[]): Label {
    if (read.length === 0) return EMPTY_CONTEXT;
    const untrusted = read.find((label) => label.trust === "untrusted");
    const internal = read.find((label) => label.sensitivity === "internal");
    return {
        origin: (untrusted ?? internal ?? read[0]).origin,
        trust: untrusted ? "untrusted" : "trusted",
        sensitivity: internal ? "internal" : "public",
    };
}

export function isInfluenced(context: Label): boolean {
    return context.trust === "untrusted";
}

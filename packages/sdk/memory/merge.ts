import type { ContextLabelRecord, Sensitivity, Trust, ValueRecord } from "@quard/shared";

// What the records of one memory item vouch for
export type MemoryLabels = {
    label: ContextLabelRecord;
    values: ValueRecord[];
};

// The most origins a label record may list
export const MAX_ORIGINS = 200;

function least(a: Trust, b: Trust): Trust {
    return a === "untrusted" ? a : b;
}

function most(a: Sensitivity, b: Sensitivity): Sensitivity {
    return a === "internal" ? a : b;
}

function rank(value: ValueRecord): number {
    return (value.trust === "untrusted" ? 2 : 0) + (value.sensitivity === "internal" ? 1 : 0);
}

// The less trusted label keeps its origin; sensitivity takes the higher one
function mergeValue(a: ValueRecord, b: ValueRecord): ValueRecord {
    const [worst, other] = rank(b) > rank(a) ? [b, a] : [a, b];
    return {
        ...worst,
        sensitivity: most(worst.sensitivity, other.sensitivity),
        flags: [...new Set([...worst.flags, ...other.flags])],
    };
}

// The least trusted and most sensitive of two sets of labels, value by value
export function mergeLabels(a: MemoryLabels, b: MemoryLabels): MemoryLabels {
    const values = new Map(a.values.map((value) => [value.hash, value]));
    for (const value of b.values) {
        const kept = values.get(value.hash);
        values.set(value.hash, kept === undefined ? value : mergeValue(kept, value));
    }
    return {
        label: {
            trust: least(a.label.trust, b.label.trust),
            sensitivity: most(a.label.sensitivity, b.label.sensitivity),
            origins: [...new Set([...a.label.origins, ...b.label.origins])].slice(0, MAX_ORIGINS),
            flagged: a.label.flagged || b.label.flagged,
        },
        values: [...values.values()],
    };
}

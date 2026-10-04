import type { MemoryRecord, Sensitivity, Trust, ValueRecord } from "@quard/shared";

// What the stored labels of one memory item vouch for
export type MemoryLabels = Pick<MemoryRecord, "label" | "values">;

// The most a label record may hold (see memoryRecord in @quard/shared)
const MAX_ORIGINS = 200;
const MAX_VALUES = 500;
const MAX_FLAGS = 20;

function least(a: Trust, b: Trust): Trust {
    return a === "untrusted" ? a : b;
}

function most(a: Sensitivity, b: Sensitivity): Sensitivity {
    return a === "internal" ? a : b;
}

// Higher is worse: untrusted first, then flagged, then internal
function rank(value: ValueRecord): number {
    return (
        (value.trust === "untrusted" ? 4 : 0) +
        (value.flags.length > 0 ? 2 : 0) +
        (value.sensitivity === "internal" ? 1 : 0)
    );
}

// The worse label keeps its origin; sensitivity takes the higher one
function mergeValue(a: ValueRecord, b: ValueRecord): ValueRecord {
    const [worst, other] = rank(b) > rank(a) ? [b, a] : [a, b];
    return {
        ...worst,
        sensitivity: most(worst.sensitivity, other.sensitivity),
        flags: [...new Set([...worst.flags, ...other.flags])].slice(0, MAX_FLAGS),
    };
}

// Over the cap, the worst values stay, so dropping one never hides a risk
function capValues(values: ValueRecord[]): ValueRecord[] {
    if (values.length <= MAX_VALUES) {
        return values;
    }
    return [...values].sort((a, b) => rank(b) - rank(a)).slice(0, MAX_VALUES);
}

// The least trusted and most sensitive of two sets of labels, value by
// value. The same rule as mergeLabels in the SDK's memory/merge.ts.
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
        values: capValues([...values.values()]),
    };
}

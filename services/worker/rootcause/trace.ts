import { byTime, readBy, type StoredLabel, type StoredStep } from "./run.ts";

// How a call's value matched earlier content: the value itself, or only its host or main domain
export type Match = "value" | "host" | "domain";

export type Appearance = Omit<StoredLabel, "keys"> & { match: Match };

// One value of a call and every place it appeared before, first appearance first.
// A value found nowhere is model-generated.
export type TracedValue = { key: string; appearances: Appearance[]; generated: boolean };

function matchOf(key: string): Match {
    const kind = key.slice(0, key.indexOf(":"));
    return kind === "host" || kind === "domain" ? kind : "value";
}

// Where each value key of a call appeared in the content the turning point read
export function traceValues(keys: string[], labels: StoredLabel[], turning: StoredStep): TracedValue[] {
    const before = labels.filter(readBy(turning)).toSorted(byTime);
    return keys.map((key) => {
        const match = matchOf(key);
        const appearances = before
            .filter((label) => label.keys.includes(key))
            .map(({ keys: _keys, ...label }) => ({ ...label, match }));
        return { key, appearances, generated: appearances.length === 0 };
    });
}

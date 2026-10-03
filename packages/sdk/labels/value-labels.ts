import { extractValues, flattenArgs, type ValueType } from "@quard/shared";
import type { ContentIndex, Match, Occurrence } from "./content-index.ts";

export type ValueLabel = {
    type: ValueType;
    value: string;
    occurrences: Occurrence[];
    // Found nowhere the run read, so the model wrote it
    modelGenerated: boolean;
};

export type ArgumentLabel = {
    path: string;
    values: ValueLabel[];
};

// Labels every traceable value in a call's arguments
export function labelArguments(input: unknown, index: ContentIndex): ArgumentLabel[] {
    return flattenArgs(input).map(({ path, value }) => ({
        path,
        values: extractValues(value).map((found) => {
            const occurrences = index.lookup(found.keys);
            return { type: found.type, value: found.value, occurrences, modelGenerated: occurrences.length === 0 };
        }),
    }));
}

// The value labels of one field, nested parts included
export function valuesAt(labels: readonly ArgumentLabel[], field: string): ValueLabel[] {
    return labels
        .filter(({ path }) => path === field || path.startsWith(`${field}.`) || path.startsWith(`${field}[`))
        .flatMap((label) => label.values);
}

// Occurrences of the value itself: exact for most types, the host for a bare host
export function exactOccurrences(value: ValueLabel): Occurrence[] {
    const wanted = value.type === "host" ? "host" : "exact";
    return value.occurrences.filter((occurrence) => occurrence.match === wanted);
}

// Where the value first appeared, using the strongest kind of match found
export function firstAppearance(value: ValueLabel, matches: readonly Match[]): Occurrence | undefined {
    for (const match of matches) {
        const found = value.occurrences.find((occurrence) => occurrence.match === match);
        if (found !== undefined) {
            return found;
        }
    }
    return undefined;
}

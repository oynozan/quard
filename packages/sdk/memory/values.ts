import { randomBytes } from "node:crypto";
import { extractValues, keyedHash, type ValueRecord, type ValueType } from "@quard/shared";
import type { ContentIndex } from "../labels/content-index.ts";
import { valueHash } from "../labels/hashed.ts";
import { exactOccurrences } from "../labels/value-labels.ts";

export type HashOf = (type: ValueType, value: string) => string | undefined;

// Limits of a value record, as the shared schema sets them
const MAX_VALUES = 500;
const MAX_FLAGS = 20;
const MAX_FLAG = 100;
const MAX_ORIGIN = 2000;

// Without a hash key, values kept in this process go by a key only it knows
const PROCESS_KEY = randomBytes(32);

// The configured key's hash, or else one only this process can match
export function localHash(type: ValueType, value: string): string {
    return valueHash(type, value) ?? keyedHash(PROCESS_KEY, type, value);
}

// Each traced value with the label it had where it first appeared, by
// hash. Only the value itself counts: a look-alike host vouches for nothing.
export function valueRecords(text: string, index: ContentIndex, hashOf: HashOf): ValueRecord[] {
    const records: ValueRecord[] = [];
    for (const { type, value, keys } of extractValues(text)) {
        const [first] = exactOccurrences({ type, value, occurrences: index.lookup(keys), modelGenerated: false });
        const hash = hashOf(type, value);
        if (first !== undefined && hash !== undefined) {
            records.push({
                hash,
                origin: first.origin.slice(0, MAX_ORIGIN),
                trust: first.trust,
                sensitivity: first.sensitivity,
                flags: first.flags.slice(0, MAX_FLAGS).map((flag) => flag.slice(0, MAX_FLAG)),
                stepId: first.stepId,
            });
        }
    }
    return records.slice(0, MAX_VALUES);
}

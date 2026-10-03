import { extractValues, type Label, type ValueRecord as StoredValue, type ValueType } from "@quard/shared";
import { valueHash } from "./hashed.ts";

// The label one traced value had where it first appeared in the sender's run
export type ValueRecord = {
    type: ValueType;
    value: string;
    // The value's own index key, such as "iban:DE89..."
    key: string;
    origin: string;
    trust: Label["trust"];
    sensitivity: Label["sensitivity"];
    flags: string[];
    stepId: string;
};

// What leaves the process for each value, its hash and never the value
export function hashValues(values: readonly ValueRecord[]): StoredValue[] {
    return values.flatMap(({ type, value, origin, trust, sensitivity, flags, stepId }) => {
        const hash = valueHash(type, value);
        return hash === undefined ? [] : [{ hash, origin, trust, sensitivity, flags, stepId }];
    });
}

// The values in a text that a stored hash vouches for, each with its stored label
export function matchValues(text: string, stored: readonly StoredValue[]): ValueRecord[] {
    const byHash = new Map(stored.map((value) => [value.hash, value]));
    return extractValues(text).flatMap(({ type, value }) => {
        const found = byHash.get(valueHash(type, value) ?? "");
        if (found === undefined) {
            return [];
        }
        const { origin, trust, sensitivity, flags, stepId } = found;
        return [{ type, value, key: `${type}:${value}`, origin, trust, sensitivity, flags, stepId }];
    });
}

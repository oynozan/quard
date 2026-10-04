import { extractValues, type ExtractedValue } from "@quard/shared";

// Value keys in the text that no record vouched for. A model wrote those
// values, so they stay model-generated. A host that a vouched value
// shares still counts as vouched.
export function unvouchedKeys(text: string, isVouched: (value: ExtractedValue) => boolean): string[] {
    const found = extractValues(text);
    const kept = new Set(found.filter(isVouched).flatMap((value) => value.keys));
    return found.flatMap((value) => (isVouched(value) ? [] : value.keys.filter((key) => !kept.has(key))));
}

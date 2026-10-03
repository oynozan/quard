import { keyedHash, parseHashKey, type ValueType } from "@quard/shared";
import { getConfig } from "../core/config.ts";

let cached: { text: string; key: Buffer } | undefined;

// The hash a traced value goes by outside the process, made with the
// configured hash key. Undefined when no key is set.
export function valueHash(type: ValueType, value: string): string | undefined {
    const text = getConfig().hashKey;
    if (!text) {
        return undefined;
    }
    if (cached?.text !== text) {
        cached = { text, key: parseHashKey(text) };
    }
    return keyedHash(cached.key, type, value);
}

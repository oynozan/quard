import { flattenArgs } from "@quard/shared";

function keysOf(value: unknown, seen: WeakSet<object>): string[] {
    if (value === null || typeof value !== "object" || seen.has(value)) {
        return [];
    }
    seen.add(value);
    if (Array.isArray(value)) {
        return value.flatMap((item) => keysOf(item, seen));
    }
    return Object.entries(value).flatMap(([key, item]) => [key, ...keysOf(item, seen)]);
}

// The text inside a value, one piece per line: object keys, strings and
// numbers. The model reads keys too, so they are scanned and indexed.
// JSON text would hide word boundaries behind escapes such as \n.
export function textOf(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }
    return [...keysOf(value, new WeakSet()), ...flattenArgs(value).map((item) => item.value)].join("\n");
}

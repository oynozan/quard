import { SECRET_FIELD } from "../redact/secrets.ts";
import { flattenArgs } from "./flatten.ts";

// Every object key inside a value, nested ones included
export function keysOf(value: unknown, seen = new WeakSet<object>()): string[] {
    if (value === null || typeof value !== "object" || seen.has(value)) {
        return [];
    }
    seen.add(value);
    if (Array.isArray(value)) {
        return value.flatMap((item) => keysOf(item, seen));
    }
    return Object.entries(value).flatMap(([key, item]) => [key, ...keysOf(item, seen)]);
}

// A path such as "auth.api_key" or "headers[0].cookie" under a field named like a secret
export function underSecret(path: string): boolean {
    return path.split(/[.[\]]/).some((name) => SECRET_FIELD.test(name));
}

function joined(value: unknown, keep: (path: string) => boolean): string {
    if (typeof value === "string") {
        return value;
    }
    const values = flattenArgs(value).filter((item) => keep(item.path));
    return [...keysOf(value, new WeakSet()), ...values.map((item) => item.value)].join("\n");
}

// The text inside a value, one piece per line: object keys, strings and
// numbers. The model reads keys too, so they are scanned and indexed.
// JSON text would hide word boundaries behind escapes such as \n.
export function textOf(value: unknown): string {
    return joined(value, () => true);
}

// JSON text holding an object or array, as that value
function parsedJson(value: unknown): unknown {
    if (typeof value !== "string") {
        return value;
    }
    try {
        const parsed: unknown = JSON.parse(value);
        return parsed !== null && typeof parsed === "object" ? parsed : value;
    } catch {
        return value;
    }
}

// The text value keys are built from: textOf without the values under
// secret-named fields, so no key carries a secret. JSON text is read as
// the value it holds, since tools often return it.
export function keyText(value: unknown): string {
    return joined(parsedJson(value), (path) => !underSecret(path));
}

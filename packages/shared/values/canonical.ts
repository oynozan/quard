// Plain JSON data with sorted keys. BigInts, Maps, Sets, cycles and
// objects with toJSON (such as Date and URL) all keep their content.
function plain(value: unknown, seen: WeakSet<object>): unknown {
    if (typeof value === "bigint") {
        return `${value}n`;
    }
    if (value === null || typeof value !== "object") {
        return value;
    }
    if (seen.has(value)) {
        return "[seen]";
    }
    seen.add(value);
    if (value instanceof Map) {
        return { map: [...value.entries()].map(([key, item]) => `${text(key, seen)}=${text(item, seen)}`).sort() };
    }
    if (value instanceof Set) {
        return { set: [...value].map((item) => text(item, seen)).sort() };
    }
    if (Array.isArray(value)) {
        return value.map((item) => plain(item, seen));
    }
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === "function") {
        return { json: plain(toJSON.call(value), seen) };
    }
    return Object.fromEntries(
        Object.entries(value)
            // Code point order, the same in every locale. Keys are unique.
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([key, item]) => [key, plain(item, seen)]),
    );
}

function text(value: unknown, seen: WeakSet<object>): string {
    return String(JSON.stringify(plain(value, seen)));
}

// Equal arguments give equal text, whatever their key order
export function canonicalJson(value: unknown): string {
    return text(value, new WeakSet());
}

// The same plain data as a value, safe to send as JSON
export function plainJson(value: unknown): unknown {
    return plain(value, new WeakSet());
}

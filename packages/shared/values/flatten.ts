export type ArgumentValue = {
    path: string;
    value: string;
};

// Splits nested arguments into single values with their paths.
// Objects seen before are skipped, so cycles end.
export function flattenArgs(input: unknown, path = "", seen = new WeakSet<object>()): ArgumentValue[] {
    if (typeof input === "string") {
        return [{ path, value: input }];
    }
    if (typeof input === "number" || typeof input === "bigint") {
        return [{ path, value: String(input) }];
    }
    if (input === null || typeof input !== "object" || seen.has(input)) {
        return [];
    }
    seen.add(input);
    if (Array.isArray(input)) {
        return input.flatMap((item, index) => flattenArgs(item, `${path}[${index}]`, seen));
    }
    return Object.entries(input).flatMap(([key, value]) =>
        flattenArgs(value, path === "" ? key : `${path}.${key}`, seen),
    );
}

// Reads a value by its path, such as "invoice.amount" or "items[0].amount"
export function valueAtPath(input: unknown, path: string): unknown {
    let current = input;
    for (const [key] of path.matchAll(/[^.[\]]+/g)) {
        if (current === null || typeof current !== "object") {
            return undefined;
        }
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

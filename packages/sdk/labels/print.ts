import { createHash } from "node:crypto";

type Json = { toJSON: () => unknown };

function hasToJson(value: object): value is Json {
    return typeof (value as Partial<Json>).toJSON === "function";
}

// JSON text with sorted keys, so a JSON round trip keeps the same text.
// Strings stay exact: hidden characters change it. Undefined when JSON
// would leave the value out.
function canonical(value: unknown, parents: Set<object>): string | undefined {
    const plain = typeof value === "object" && value !== null && hasToJson(value) ? value.toJSON() : value;
    if (typeof plain === "bigint") {
        return `${plain}n`;
    }
    if (typeof plain !== "object" || plain === null) {
        return JSON.stringify(plain);
    }
    if (parents.has(plain)) {
        return "<cycle>";
    }
    parents.add(plain);
    let text: string;
    if (Array.isArray(plain)) {
        text = `[${plain.map((item) => canonical(item, parents) ?? "null").join(",")}]`;
    } else {
        const fields = Object.keys(plain)
            .sort()
            .flatMap((key) => {
                const item = canonical((plain as Record<string, unknown>)[key], parents);
                return item === undefined ? [] : [`${JSON.stringify(key)}:${item}`];
            });
        text = `{${fields.join(",")}}`;
    }
    parents.delete(plain);
    return text;
}

// The print a label record holds: a hash of the whole value, so any
// change to a string, a flag or which value sits under which key shows
export function printOf(value: unknown): string {
    return createHash("sha256")
        .update(canonical(value, new Set()) ?? "")
        .digest("hex");
}

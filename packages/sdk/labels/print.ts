import { createHmac, randomBytes } from "node:crypto";
import { projectKey } from "../core/project-key.ts";

// Without the project's hash key, records stay in this process, so prints
// go by a key only it knows
const PROCESS_KEY = randomBytes(32);

// The project's key, which only its agents get, or else the process key
function printKey(): Buffer {
    return projectKey() ?? PROCESS_KEY;
}

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
        // Array.from visits holes too, which JSON writes as null
        text = `[${Array.from(plain, (item) => canonical(item, parents) ?? "null").join(",")}]`;
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

// The print a label record holds: a keyed hash of the whole value. Any
// change to a string, a flag or which value sits under which key shows,
// and short content can't be guessed from it without the key.
export function printOf(value: unknown): string {
    return createHmac("sha256", printKey())
        .update(`print:${canonical(value, new Set()) ?? ""}`)
        .digest("hex");
}

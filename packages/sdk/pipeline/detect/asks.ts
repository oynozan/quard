import { flattenArgs, keysOf, SECRET_FIELD, underSecret, valueAtPath } from "@quard/shared";
import { chunkSpans, MAX_CHUNK, type ChunkSpan } from "../../detectors/chunks.ts";

// A part of one text in the output. A strip takes it out.
export type Part = { text: string; span: ChunkSpan };

// One request to the detector: the text it reads, as the agent would,
// and the parts of the output it covers. Keys are read too, but can't
// be taken out, so they cover no parts.
export type Ask = { raw: string; parts: Part[] };

// A text the detector reads, and the output text a strip takes out with it
type Found = { raw: string; text: string };

// A bare number tells a detector nothing
const NUMBER = /^[-+]?(?:\d[\d,_]*(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i;

// Plain field names say nothing. Keys with spaces, or long ones, can
// carry outside text, such as a map keyed by what a user typed.
function readsAsText(key: string): boolean {
    return /\s/.test(key.trim()) || key.length > 40;
}

// JSON text holding an object or array, as that value
function jsonIn(text: string): object | undefined {
    if (!/^\s*[[{]/.test(text)) {
        return undefined;
    }
    try {
        return JSON.parse(text) as object;
    } catch {
        return undefined;
    }
}

// The value of a {name, value} pair named like a secret, as in header
// and env lists: [{ name: "Cookie", value: "sid=..." }]
function secretPair(input: unknown, path: string): boolean {
    const match = /^(?:(.*)\.)?value$/.exec(path);
    if (match === null) {
        return false;
    }
    const pair = (match[1] === undefined ? input : valueAtPath(input, match[1])) as Record<string, unknown>;
    return [pair.name, pair.key].some((name) => typeof name === "string" && SECRET_FIELD.test(name));
}

// Values under a field named like a secret never leave the process
function hidden(input: unknown, path: string): boolean {
    return underSecret(path) || secretPair(input, path);
}

// True when a value holds a hidden value, JSON text inside it included
function holdsSecret(input: unknown): boolean {
    return flattenArgs(input).some(({ path, value }) => {
        const inner = jsonIn(value);
        return hidden(input, path) || (inner !== undefined && holdsSecret(inner));
    });
}

// What the detector may read in a value. JSON text that holds a secret
// is read as its keys and values without it, and a strip takes out the
// whole text. `text` is the output text a value sits in.
function readable(input: unknown, text?: string): Found[] {
    return flattenArgs(input)
        .filter(({ path }) => !hidden(input, path))
        .flatMap(({ value }) => {
            const outer = text ?? value;
            const inner = jsonIn(value);
            if (inner === undefined || !holdsSecret(inner)) {
                return [{ raw: value, text: outer }];
            }
            const keys = keysOf(inner)
                .filter(readsAsText)
                .map((raw) => ({ raw, text: outer }));
            return [...keys, ...readable(inner, outer)];
        });
}

// Packs short texts together while they fit in one request
function pack(items: Ask[], max: number): Ask[] {
    const packs: Ask[] = [];
    for (const item of items) {
        const last = packs.at(-1);
        if (last !== undefined && last.raw.length + 2 + item.raw.length <= max) {
            packs[packs.length - 1] = { raw: `${last.raw}\n\n${item.raw}`, parts: [...last.parts, ...item.parts] };
        } else {
            packs.push(item);
        }
    }
    return packs;
}

// What to ask the detector about an output: short values and text-like
// keys packed together, then long ones in chunks of their own. A wide
// result takes a few requests, not one per value.
export function asksFor(output: unknown, max = MAX_CHUNK): Ask[] {
    // Each text to read, with the output texts a strip takes out with it
    const values = new Map<string, Set<string>>();
    for (const { raw, text } of readable(output)) {
        if (raw.trim().length > 0 && !NUMBER.test(raw.trim())) {
            values.set(raw, (values.get(raw) ?? new Set<string>()).add(text));
        }
    }
    // A key the same as a value is still asked: a strip takes the value out but
    // never the key, so only its own ask can flag it
    const keys = [...new Set(keysOf(output))].filter(readsAsText);
    const items: Array<[string, Set<string>]> = [
        ...keys.map((key): [string, Set<string>] => [key, new Set()]),
        ...values,
    ];
    // A chunk of a text from the output covers that part of it. One of a
    // text read from JSON covers the whole JSON text.
    const asks = ([raw, texts]: [string, Set<string>]): Ask[] =>
        (raw.length > max ? chunkSpans(raw, max) : [{ start: 0, end: raw.length }]).map((span) => ({
            raw: raw.slice(span.start, span.end),
            parts: [...texts].map((text) => ({ text, span: text === raw ? span : { start: 0, end: text.length } })),
        }));
    return [
        ...pack(items.filter(([raw]) => raw.length <= max).flatMap(asks), max),
        ...items.filter(([raw]) => raw.length > max).flatMap(asks),
    ];
}

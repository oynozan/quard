import { flattenArgs, SECRET_FIELD } from "@quard/shared";
import { chunkSpans, MAX_CHUNK, type ChunkSpan } from "../../detectors/chunks.ts";
import { keysOf } from "../../labels/text-of.ts";

// A part of one text in the output. A strip takes it out.
export type Part = { text: string; span: ChunkSpan };

// One request to the detector: the text it reads, as the agent would,
// and the parts of the output it covers. Keys are read too, but can't
// be taken out, so they cover no parts.
export type Ask = { raw: string; parts: Part[] };

// A bare number tells a detector nothing
const NUMBER = /^[-+]?(?:\d[\d,_]*(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i;

// Values under a field named like a secret never leave the process
function underSecret(path: string): boolean {
    return path.split(/[.[\]]/).some((name) => SECRET_FIELD.test(name));
}

// Plain field names say nothing. Keys with spaces, or long ones, can
// carry outside text, such as a map keyed by what a user typed.
function readsAsText(key: string): boolean {
    return /\s/.test(key.trim()) || key.length > 40;
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
// keys packed together, then long values in chunks of their own. A wide
// result takes a few requests, not one per value.
export function asksFor(output: unknown, max = MAX_CHUNK): Ask[] {
    const values = [
        ...new Set(flattenArgs(output).flatMap((item) => (underSecret(item.path) ? [] : [item.value]))),
    ].filter((value) => value.trim().length > 0 && !NUMBER.test(value.trim()));
    const keys = [...new Set(keysOf(output))].filter((key) => readsAsText(key) && !values.includes(key));
    const short = [
        ...keys.map((key) => ({ raw: key, parts: [] })),
        ...values
            .filter((value) => value.length <= max)
            .map((value) => ({ raw: value, parts: [{ text: value, span: { start: 0, end: value.length } }] })),
    ];
    const long = values
        .filter((value) => value.length > max)
        .flatMap((value) =>
            chunkSpans(value, max).map((span) => ({
                raw: value.slice(span.start, span.end),
                parts: [{ text: value, span }],
            })),
        );
    return [...pack(short, max), ...long];
}

import { emailSpans, findSensitive } from "@quard/shared";

// The most text a detector reads at once
export const MAX_CHUNK = 4000;
// How far a chunk reaches back into the one before when a paragraph is
// cut, so a sentence at the cut is read whole at least once
const OVERLAP = 200;

// Where a chunk sits in its text
export type ChunkSpan = { start: number; end: number };

const isHigh = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

// Text between blank lines, without blank paragraphs
function paragraphs(text: string): ChunkSpan[] {
    const spans: ChunkSpan[] = [];
    let start = 0;
    for (const match of text.matchAll(/\n\s*\n/g)) {
        spans.push({ start, end: match.index });
        start = match.index + match[0].length;
    }
    spans.push({ start, end: text.length });
    return spans.filter((span) => text.slice(span.start, span.end).trim().length > 0);
}

// A cut here would split a sensitive value, so both halves would leave unmasked
function insideValue(at: number, guards: ChunkSpan[]): boolean {
    return guards.some((guard) => guard.start < at && at < guard.end);
}

// Where a chunk that starts at `start` ends: after the last line break,
// sentence end or space in its second half, else at the limit. A value
// that the limit falls inside is kept whole, even past the limit, and a
// character made of two halves is never split.
function cutAt(text: string, start: number, max: number, guards: ChunkSpan[]): number {
    const limit = start + max;
    const low = start + Math.floor(max / 2);
    const window = text.slice(low, limit);
    for (const pattern of [/\n/g, /[.!?]["')\]]?\s/g, /\s/g]) {
        const ends = [...window.matchAll(pattern)].map((match) => low + match.index + match[0].length);
        const best = ends.findLast((at) => at > start && !insideValue(at, guards));
        if (best !== undefined) {
            return best;
        }
    }
    const inside = guards.find((guard) => guard.start < limit && limit < guard.end);
    if (inside !== undefined) {
        return inside.start > start ? inside.start : inside.end;
    }
    if (isHigh(text.charCodeAt(limit - 1)) && isLow(text.charCodeAt(limit))) {
        return limit - 1 > start ? limit - 1 : limit + 1;
    }
    return limit;
}

// Where the chunk after a cut starts: a word start up to OVERLAP before
// the cut, never inside a value
function overlapStart(text: string, start: number, cut: number, max: number): number {
    const reach = Math.min(OVERLAP, Math.floor(max / 4));
    const from = Math.max(start + 1, cut - reach);
    const space = text.slice(from, cut).search(/\s\S/);
    return space === -1 ? cut : from + space + 1;
}

// Cuts a paragraph longer than `max` into overlapping pieces
function pieces(text: string, paragraph: ChunkSpan, max: number, guards: ChunkSpan[]): ChunkSpan[] {
    const out: ChunkSpan[] = [];
    let start = paragraph.start;
    while (start < paragraph.end) {
        if (paragraph.end - start <= max) {
            out.push({ start, end: paragraph.end });
            break;
        }
        const cut = Math.min(cutAt(text, start, max, guards), paragraph.end);
        out.push({ start, end: cut });
        const next = cut >= paragraph.end ? paragraph.end : overlapStart(text, start, cut, max);
        // The next chunk never starts inside a value: half a value would leave unmasked
        const inside = guards.find((guard) => guard.start < next && next < guard.end);
        start = inside === undefined ? next : inside.end;
    }
    return out.filter((piece) => text.slice(piece.start, piece.end).trim().length > 0);
}

// Splits text into chunks of about `max` characters: whole paragraphs
// where they fit, else pieces cut at line breaks, sentence ends or
// spaces, never inside an IBAN, card number, email or secret
export function chunkSpans(text: string, max = MAX_CHUNK): ChunkSpan[] {
    const guards = [...findSensitive(text), ...emailSpans(text)];
    const chunks: ChunkSpan[] = [];
    for (const paragraph of paragraphs(text)) {
        for (const piece of pieces(text, paragraph, max, guards)) {
            const last = chunks.at(-1);
            if (last !== undefined && piece.start >= last.end && piece.end - last.start <= max) {
                chunks[chunks.length - 1] = { start: last.start, end: piece.end };
            } else {
                chunks.push(piece);
            }
        }
    }
    return chunks;
}

export function chunkText(text: string, max = MAX_CHUNK): string[] {
    return chunkSpans(text, max).map((span) => text.slice(span.start, span.end));
}

// Half of a two-part character can come from a broken source. It is
// replaced, since a detector's API refuses text that holds one.
export function wellFormed(text: string): string {
    return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
}

// The text without the given chunks. What is left keeps its order, with
// a blank line where a chunk was taken out.
export function withoutSpans(text: string, spans: ChunkSpan[]): string {
    const kept: string[] = [];
    let pos = 0;
    for (const span of [...spans].sort((a, b) => a.start - b.start)) {
        kept.push(text.slice(pos, Math.max(pos, span.start)));
        pos = Math.max(pos, span.end);
    }
    kept.push(text.slice(pos));
    return kept
        .map((part) => part.replace(/^\s*\n/, "").replace(/\n\s*$/, ""))
        .filter((part) => part.trim().length > 0)
        .join("\n\n");
}

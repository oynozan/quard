// A value found in text, with where it starts and ends
// (UTF-16 indexes, as regex matches report them)
export type Span = {
    start: number;
    end: number;
    value: string;
};

// Replaces spans with spaces of the same length, so later finders skip
// them and indexes stay aligned
export function blankSpans(text: string, spans: readonly Span[]): string {
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    let out = "";
    let pos = 0;
    for (const span of sorted) {
        if (span.end <= pos) {
            continue;
        }
        const start = Math.max(span.start, pos);
        out += text.slice(pos, start) + " ".repeat(span.end - start);
        pos = span.end;
    }
    return out + text.slice(pos);
}

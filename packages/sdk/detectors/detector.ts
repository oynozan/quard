// An AI check that scores text from 0 (safe) to 1 (risky).
// Detectors only tighten: they can flag or strip, never allow.
export type DetectorQuestion = "instructions";

export type Detector = {
    readonly name: string;
    score(question: DetectorQuestion, text: string): Promise<number>;
};

export type DetectorRules = {
    // "observe" saves scores without waiting; "enforce" waits and acts.
    readonly mode: "observe" | "enforce";
    readonly flagAt: number;
    readonly stripAt: number;
};

export const DEFAULT_DETECTOR_RULES: DetectorRules = { mode: "observe", flagAt: 0.5, stripAt: 0.9 };

const MAX_CHUNK = 4000;

// Splits at blank lines, cuts paragraphs longer than `max`, then packs
// the pieces into chunks of at most `max` characters.
export function chunkText(text: string, max = MAX_CHUNK): string[] {
    const pieces = text
        .split(/\n\s*\n/)
        .filter((p) => p.trim().length > 0)
        .flatMap((p) => Array.from({ length: Math.ceil(p.length / max) }, (_, i) => p.slice(i * max, (i + 1) * max)));
    const chunks: string[] = [];
    for (const piece of pieces) {
        const last = chunks.at(-1);
        if (last !== undefined && last.length + 2 + piece.length <= max) {
            chunks[chunks.length - 1] = `${last}\n\n${piece}`;
        } else {
            chunks.push(piece);
        }
    }
    return chunks;
}

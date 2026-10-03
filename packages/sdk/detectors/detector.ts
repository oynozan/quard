import type { DetectorAnswer } from "./labels.ts";

// An AI check that picks one predefined label for a text, with the
// chance of each label. Detectors only tighten: they can flag or strip, never allow.
export type Detector = {
    readonly name: string;
    label(text: string): Promise<DetectorAnswer>;
};

export type DetectorRules = {
    // "enforce" (the default) waits and acts; "observe" saves labels without waiting.
    readonly mode: "observe" | "enforce";
    // Flags text whose risky labels together reach this chance
    readonly flagAt: number;
    // Drops chunks at least this likely to be a prompt injection
    readonly stripAt: number;
};

export const DEFAULT_DETECTOR_RULES: DetectorRules = { mode: "enforce", flagAt: 0.5, stripAt: 0.9 };

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

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

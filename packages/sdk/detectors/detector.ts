import type { DetectorAnswer } from "./labels.ts";

// An AI check that picks one predefined label for a text, with the
// chance of each label. Detectors only tighten: they can flag or strip, never allow.
export type Detector = {
    readonly name: string;
    // The signal fires when Quard stops waiting for the answer
    label(text: string, options?: { signal?: AbortSignal }): Promise<DetectorAnswer>;
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

// A detector call that failed, with a short reason the warning records,
// such as "http_401", "timeout" or "bad_reply"
export class DetectorError extends Error {
    readonly reason: string;

    constructor(reason: string) {
        super(`The detector failed: ${reason}`);
        this.name = "DetectorError";
        this.reason = reason;
    }
}

import { DETECTOR_LABELS, LABEL_NAMES, type DetectorLabel } from "@quard/shared";
import { DetectorError } from "./detector.ts";

// The list lives in shared, so the worker and the dashboard read the same one
export { DETECTOR_LABELS, LABEL_NAMES, type DetectorLabel };

// What a detector answered for one piece of text
export type DetectorAnswer = {
    // The most likely label
    label: DetectorLabel;
    // The chance of each label, from 0 to 1
    probabilities: Partial<Record<DetectorLabel, number>>;
    // The chance that some part of the text tries to instruct the AI
    // agent reading it, for a detector that answers this on its own
    injection?: number;
};

const RISKY = LABEL_NAMES.filter((name) => DETECTOR_LABELS[name].risky);

const chance = (answer: DetectorAnswer, name: DetectorLabel): number => answer.probabilities[name] ?? 0;

// The chance the text is an attack of any kind. Rounded, so sums such
// as 0.6 + 0.3 compare as written.
export function riskOf(answer: DetectorAnswer): number {
    const sum = RISKY.reduce((total, name) => total + chance(answer, name), 0);
    return Math.min(1, Math.round(sum * 1e6) / 1e6);
}

// The most likely risky label. A tie goes to the one listed first.
export function topRisk(answer: DetectorAnswer): DetectorLabel {
    return RISKY.reduce((best, name) => (chance(answer, name) > chance(answer, best) ? name : best));
}

const isLabel = (name: string): boolean => Object.hasOwn(DETECTOR_LABELS, name);

// Throws unless every label is known, the answer's label has its own
// chance, and every chance, the injection one included, is from 0 to 1
export function checkAnswer(answer: DetectorAnswer): DetectorAnswer {
    const known =
        isLabel(answer.label) &&
        answer.probabilities[answer.label] !== undefined &&
        Object.keys(answer.probabilities).every(isLabel);
    const chances = [...Object.values(answer.probabilities), ...("injection" in answer ? [answer.injection] : [])];
    if (!known || !chances.every((p) => typeof p === "number" && p >= 0 && p <= 1)) {
        throw new DetectorError("bad_reply");
    }
    return answer;
}

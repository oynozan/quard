import { z } from "zod";
import type { Detector } from "../detector.ts";
import { DETECTOR_LABELS, LABEL_NAMES, type DetectorAnswer } from "../labels.ts";

// The pinned model. Thresholds are tuned for this version only.
export const JEV_MODEL = "jev-1.13.0";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const TIMEOUT_MS = 5000;

// One choice question: Jev picks a label and gives the chance of each
const QUESTION = {
    type: "choice",
    instructions:
        "Pick the label that best describes this text, which an AI agent read from a web page, an email or a tool.",
    criteria: Object.fromEntries(LABEL_NAMES.map((name) => [name, DETECTOR_LABELS[name].means])),
};

const label = z.enum(LABEL_NAMES);

// Another model answering fails, so the version stays pinned
const reply = z.object({
    model: z.literal(JEV_MODEL),
    answers: z.object({ label: z.object({ choice: label, probabilities: z.partialRecord(label, z.number()) }) }),
});

export type JevOptions = {
    // A TypeSafe API key
    apiKey: string;
};

// Jev from TypeSafe. It only reads what Quard sends: public content, redacted.
export function jevDetector({ apiKey }: JevOptions): Detector {
    if (!apiKey) {
        throw new TypeError("jevDetector() needs an apiKey");
    }
    return {
        name: JEV_MODEL,
        async label(text: string): Promise<DetectorAnswer> {
            const response = await fetch(JEV_URL, {
                method: "POST",
                headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
                body: JSON.stringify({ model: JEV_MODEL, state: text, questions: { label: QUESTION } }),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (!response.ok) {
                throw new Error(`Jev answered HTTP ${response.status}`);
            }
            const { choice, probabilities } = reply.parse(await response.json()).answers.label;
            return { label: choice, probabilities };
        },
    };
}

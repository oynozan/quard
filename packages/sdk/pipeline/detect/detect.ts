import { redactText } from "@quard/shared";
import { getConfig } from "../../core/config.ts";
import { now, record } from "../../core/recorder.ts";
import { wellFormed, withoutSpans, type ChunkSpan } from "../../detectors/chunks.ts";
import { checkAnswer, riskOf, topRisk, type DetectorAnswer } from "../../detectors/labels.ts";
import type { GuardCall } from "../../guards/call.ts";
import { mapStrings } from "../../guards/source/strip.ts";
import { effectiveDetectorRules } from "../../policy/state.ts";
import { recordDecision } from "../checks.ts";
import { withFlags, type Shown } from "../content.ts";
import { asksFor, type Ask } from "./asks.ts";
import { createLimit } from "./limit.ts";

const DETECTOR_TIMEOUT_MS = 5000;
// Requests to the detector in flight at once, in one process
const limit = createLimit(8);

// One request, what was sent, and the label that came back
type Asked = { ask: Ask; sent: string; answer: DetectorAnswer };

const injection = ({ answer }: Asked): number => answer.probabilities.prompt_injection ?? 0;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("the detector took too long")), ms);
    });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

// Each text a strip changes, without the parts likely to be an injection
function stripped(asked: Asked[], stripAt: number): Map<string, string> {
    const spans = new Map<string, ChunkSpan[]>();
    for (const item of asked.filter((one) => injection(one) >= stripAt)) {
        for (const part of item.ask.parts) {
            spans.set(part.text, [...(spans.get(part.text) ?? []), part.span]);
        }
    }
    return new Map([...spans].map(([text, list]) => [text, withoutSpans(text, list)]));
}

// Asks the AI detector to label public content. Observe mode records
// the labels without waiting. Enforce mode waits, drops chunks likely
// to be a prompt injection and flags content whose risky labels reach
// flagAt. Errors and timeouts leave the content as the rules left it.
export async function detectContent(call: GuardCall, shown: Shown, enforced: boolean): Promise<Shown> {
    const { detector, detectorRules } = getConfig();
    // Internal content is never sent to a detector
    if (detector === undefined || shown.label.sensitivity !== "public") {
        return shown;
    }
    const rules = effectiveDetectorRules(detectorRules);
    const acts = enforced && rules.mode === "enforce";
    // Text leaves without secrets, and with emails, IBANs and cards masked
    const ask = async (item: Ask): Promise<Asked> => {
        const sent = wellFormed(redactText(item.raw));
        return { ask: item, sent, answer: checkAnswer(await limit(() => detector.label(sent))) };
    };
    const labeling = Promise.all(asksFor(shown.output).map(ask));
    const { runId, stepId, agent, tool } = call;
    // Records the decision and each request's label. Gives the flags it
    // adds and the texts a strip changes.
    const report = (asked: Asked[]) => {
        const answers = asked.map((item) => item.answer);
        const risky = answers.filter((answer) => riskOf(answer) >= rules.flagAt);
        const flags = [...new Set(risky.map((answer) => `detector:${topRisk(answer)}`))];
        const kept = stripped(asked, rules.stripAt);
        recordDecision(call, {
            guard: "source",
            rule: `detector:${detector.name}`,
            decision: kept.size > 0 ? "strip" : flags.length > 0 ? "flag" : "pass",
            mode: acts ? "block" : "observe",
            score: Math.max(0, ...answers.map(riskOf)),
            // Every label the detector gave, such as "article,prompt_injection"
            reason: [...new Set(answers.map((answer) => answer.label))].join(",") || undefined,
        });
        // The redacted text is kept, so people can check the label later
        asked.forEach(({ sent, answer }, chunk) =>
            record({
                type: "chunk_label",
                runId,
                stepId,
                agent,
                at: now(),
                tool,
                detector: detector.name,
                chunk,
                text: sent,
                label: answer.label,
                // checkAnswer made sure every chance is a number
                probabilities: answer.probabilities as Record<string, number>,
                score: riskOf(answer),
            }),
        );
        return { flags, kept };
    };
    const fail = (): void => {
        record({ type: "warning", runId, stepId, agent, at: now(), code: "detector_error", tool });
    };
    if (!acts) {
        void labeling.then(report, fail);
        return shown;
    }
    try {
        const { flags, kept } = report(await withTimeout(labeling, DETECTOR_TIMEOUT_MS));
        const output = kept.size === 0 ? shown.output : mapStrings(shown.output, (text) => kept.get(text) ?? text);
        return withFlags({ output, label: shown.label }, flags);
    } catch {
        fail();
        return shown;
    }
}

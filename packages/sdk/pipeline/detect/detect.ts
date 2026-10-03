import { redactText } from "@quard/shared";
import { getConfig } from "../../core/config.ts";
import { now, record } from "../../core/recorder.ts";
import { wellFormed, withoutSpans, type ChunkSpan } from "../../detectors/chunks.ts";
import { DetectorError } from "../../detectors/detector.ts";
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
// Content the detector could not check while acting
const UNCHECKED = "detector:unchecked";

// What came back for one request: its label, or why there is none
type Answered = { ask: Ask; sent: string; answer: DetectorAnswer };
type Failed = { ask: Ask; failed: string };
type Result = Answered | Failed;

const injection = ({ answer }: Answered): number => answer.probabilities.prompt_injection ?? 0;

// Fails once the signal fires, so a detector that ignores the signal
// still gives up its place in the queue
function whenStopped(signal: AbortSignal): Promise<never> {
    return new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new DetectorError("timeout")), { once: true });
    });
}

// Each text a strip changes, without the parts likely to be an injection
function stripped(answered: Answered[], stripAt: number): Map<string, string> {
    const spans = new Map<string, ChunkSpan[]>();
    for (const item of answered.filter((one) => injection(one) >= stripAt)) {
        for (const part of item.ask.parts) {
            spans.set(part.text, [...(spans.get(part.text) ?? []), part.span]);
        }
    }
    return new Map([...spans].map(([text, list]) => [text, withoutSpans(text, list)]));
}

// Asks the AI detector to label public content. Observe mode records
// the labels without waiting. Enforce mode waits up to 5 s, drops
// chunks likely to be a prompt injection and flags content whose risky
// labels reach flagAt. Requests that fail or answer late leave their
// part unchecked: enforce mode flags it, so its values can't pay or
// send anything without a person.
export async function detectContent(call: GuardCall, shown: Shown, enforced: boolean): Promise<Shown> {
    const { detector, detectorRules } = getConfig();
    // Internal content is never sent to a detector
    if (detector === undefined || shown.label.sensitivity !== "public") {
        return shown;
    }
    const rules = effectiveDetectorRules(detectorRules);
    const acts = enforced && rules.mode === "enforce";
    const stop = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
            stop.abort();
            resolve();
        }, DETECTOR_TIMEOUT_MS);
    });
    // Text leaves without secrets, and with emails, IBANs and cards masked
    const one = async (ask: Ask): Promise<Result> => {
        const sent = wellFormed(redactText(ask.raw));
        try {
            const answer = await limit(() =>
                // A request still waiting for its turn at the deadline is not sent
                stop.signal.aborted
                    ? Promise.reject(new DetectorError("timeout"))
                    : Promise.race([detector.label(sent, { signal: stop.signal }), whenStopped(stop.signal)]),
            );
            return { ask, sent, answer: checkAnswer(answer) };
        } catch (error) {
            return { ask, failed: error instanceof DetectorError ? error.reason : "error" };
        }
    };
    const labeling = Promise.all(
        asksFor(shown.output).map((ask) =>
            Promise.race([one(ask), late.then((): Result => ({ ask, failed: "timeout" }))]),
        ),
    ).finally(() => clearTimeout(timer));
    const { runId, stepId, agent, tool } = call;
    // Records the decision, each label and a warning for what failed.
    // Gives the flags it adds and the texts a strip changes.
    const report = (results: Result[]) => {
        const answered = results.filter((result): result is Answered => "answer" in result);
        const failed = results.filter((result): result is Failed => "failed" in result);
        const answers = answered.map((item) => item.answer);
        const risky = answers.filter((answer) => riskOf(answer) >= rules.flagAt);
        const flags = [
            ...new Set(risky.map((answer) => `detector:${topRisk(answer)}`)),
            ...(failed.length > 0 ? [UNCHECKED] : []),
        ];
        const kept = stripped(answered, rules.stripAt);
        // Every label the detector gave, such as "article,prompt_injection"
        const labels = [...new Set(answers.map((answer) => answer.label))];
        recordDecision(call, {
            guard: "source",
            rule: `detector:${detector.name}`,
            decision: kept.size > 0 ? "strip" : flags.length > 0 ? "flag" : "pass",
            mode: acts ? "block" : "observe",
            score: Math.max(0, ...answers.map(riskOf)),
            reason: [...labels, ...(failed.length > 0 ? ["unchecked"] : [])].join(",") || undefined,
        });
        // The redacted text is kept, so people can check the label later
        results.forEach((result, chunk) => {
            if ("answer" in result) {
                record({
                    type: "chunk_label",
                    runId,
                    stepId,
                    agent,
                    at: now(),
                    tool,
                    detector: detector.name,
                    chunk,
                    text: result.sent,
                    label: result.answer.label,
                    // checkAnswer made sure every chance is a number
                    probabilities: result.answer.probabilities as Record<string, number>,
                    score: riskOf(result.answer),
                });
            }
        });
        const [first] = failed;
        if (first !== undefined) {
            record({
                type: "warning",
                runId,
                stepId,
                agent,
                at: now(),
                code: "detector_error",
                tool,
                reason: first.failed,
            });
        }
        return { flags, kept };
    };
    if (!acts) {
        void labeling.then(report);
        return shown;
    }
    const { flags, kept } = report(await labeling);
    const output = kept.size === 0 ? shown.output : mapStrings(shown.output, (text) => kept.get(text) ?? text);
    return withFlags({ output, label: shown.label }, flags);
}

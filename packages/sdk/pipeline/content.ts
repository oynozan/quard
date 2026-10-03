import { flattenArgs, redactText, type Label } from "@quard/shared";
import { getConfig } from "../core/config.ts";
import { now, record } from "../core/recorder.ts";
import { chunkText } from "../detectors/detector.ts";
import { checkAnswer, riskOf, topRisk, type DetectorAnswer } from "../detectors/labels.ts";
import type { FailResult, GuardCall } from "../guards/call.ts";
import { mapStrings } from "../guards/source/strip.ts";
import { textOf } from "../labels/text-of.ts";
import { effectiveDetectorRules, signatureMode } from "../policy/state.ts";
import { findSignatures } from "../signatures/check.ts";
import { recordDecision } from "./checks.ts";

// What the agent gets to read, and its label
export type Shown = { output: unknown; label: Label };

const DETECTOR_TIMEOUT_MS = 5000;

function withFlags(shown: Shown, flags: string[]): Shown {
    return { output: shown.output, label: { ...shown.label, flags: [...shown.label.flags, ...flags] } };
}

// Checks content against the signature feed. A "block" signature
// withholds it; a "flag" one marks it, so later calls face stricter rules.
export function signContent(call: GuardCall, shown: Shown, enforced: boolean): Shown | { blocked: FailResult } {
    const found = findSignatures(call.tool, textOf(shown.output), "content");
    const mode = enforced ? signatureMode() : "observe";
    for (const signature of found) {
        recordDecision(call, {
            guard: "signature",
            rule: signature.id,
            decision: signature.action,
            mode,
            reason: "signature_matched",
            field: signature.id,
        });
    }
    if (mode === "observe") {
        return shown;
    }
    const block = found.find((signature) => signature.action === "block");
    if (block !== undefined) {
        const reason = "content_blocked";
        return { blocked: { guard: "signature", rule: block.id, decision: "block", mode, reason, field: block.id } };
    }
    return withFlags(
        shown,
        found.map((signature) => `signature:${signature.id}`),
    );
}

type Labeled = { text: string; chunks: string[]; answers: DetectorAnswer[] };

const injection = (answer: DetectorAnswer): number => answer.probabilities.prompt_injection ?? 0;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("the detector took too long")), ms);
    });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

// Asks the AI detector to label each chunk of public content. Observe
// mode records the labels without waiting. Enforce mode waits, drops
// chunks likely to be a prompt injection and flags content whose risky
// labels reach flagAt. Errors and timeouts leave the content as the
// rules left it.
export async function detectContent(call: GuardCall, shown: Shown, enforced: boolean): Promise<Shown> {
    const { detector, detectorRules } = getConfig();
    // Internal content is never sent to a detector
    if (detector === undefined || shown.label.sensitivity !== "public") {
        return shown;
    }
    const rules = effectiveDetectorRules(detectorRules);
    const acts = enforced && rules.mode === "enforce";
    // Text leaves without secrets, and with emails, IBANs and cards masked
    const ask = async (chunk: string): Promise<DetectorAnswer> => checkAnswer(await detector.label(redactText(chunk)));
    const texts = [...new Set(flattenArgs(shown.output).map((item) => item.value))];
    const labeling = Promise.all(
        texts.map(async (text): Promise<Labeled> => {
            const chunks = chunkText(text);
            return { text, chunks, answers: await Promise.all(chunks.map(ask)) };
        }),
    );
    // Records the decision and returns the flags it adds
    const report = (labeled: Labeled[]): string[] => {
        const answers = labeled.flatMap((item) => item.answers);
        const risky = answers.filter((answer) => riskOf(answer) >= rules.flagAt);
        const flags = [...new Set(risky.map((answer) => `detector:${topRisk(answer)}`))];
        const strips = answers.some((answer) => injection(answer) >= rules.stripAt);
        recordDecision(call, {
            guard: "source",
            rule: `detector:${detector.name}`,
            decision: strips ? "strip" : flags.length > 0 ? "flag" : "pass",
            mode: acts ? "block" : "observe",
            score: Math.max(0, ...answers.map(riskOf)),
            // Every label the detector gave, such as "article,prompt_injection"
            reason: [...new Set(answers.map((answer) => answer.label))].join(",") || undefined,
        });
        return flags;
    };
    const fail = (): void => {
        const { runId, stepId, agent, tool } = call;
        record({ type: "warning", runId, stepId, agent, at: now(), code: "detector_error", tool });
    };
    if (!acts) {
        void labeling.then(report, fail);
        return shown;
    }
    try {
        const labeled = await withTimeout(labeling, DETECTOR_TIMEOUT_MS);
        const flags = report(labeled);
        // Each text with a likely injection, without those chunks
        const kept = new Map(
            labeled
                .filter((item) => item.answers.some((answer) => injection(answer) >= rules.stripAt))
                .map((item) => [
                    item.text,
                    item.chunks
                        .filter((_, index) => injection(item.answers[index] as DetectorAnswer) < rules.stripAt)
                        .join("\n\n"),
                ]),
        );
        const output = kept.size === 0 ? shown.output : mapStrings(shown.output, (text) => kept.get(text) ?? text);
        return withFlags({ output, label: shown.label }, flags);
    } catch {
        fail();
        return shown;
    }
}

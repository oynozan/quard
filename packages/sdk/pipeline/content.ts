import { flattenArgs, type Label } from "@quard/shared";
import { getConfig } from "../core/config.ts";
import { now, record } from "../core/recorder.ts";
import { chunkText } from "../detectors/detector.ts";
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

type Scored = { text: string; chunks: string[]; scores: number[] };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("the detector took too long")), ms);
    });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

// Asks the AI detector about each chunk of public content. Observe mode
// records the scores without waiting. Enforce mode waits, drops chunks
// at stripAt or more and flags content at flagAt or more. Errors and
// timeouts leave the content as the rules left it.
export async function detectContent(call: GuardCall, shown: Shown, enforced: boolean): Promise<Shown> {
    const { detector, detectorRules } = getConfig();
    // Internal content is never sent to a detector
    if (detector === undefined || shown.label.sensitivity !== "public") {
        return shown;
    }
    const rules = effectiveDetectorRules(detectorRules);
    const acts = enforced && rules.mode === "enforce";
    const score = async (chunk: string): Promise<number> => {
        const value = await detector.score("instructions", chunk);
        if (!(value >= 0 && value <= 1)) {
            throw new Error("a detector score must be from 0 to 1");
        }
        return value;
    };
    const texts = [...new Set(flattenArgs(shown.output).map((item) => item.value))];
    const scoring = Promise.all(
        texts.map(async (text): Promise<Scored> => {
            const chunks = chunkText(text);
            return { text, chunks, scores: await Promise.all(chunks.map(score)) };
        }),
    );
    const report = (scored: Scored[]): number => {
        const max = Math.max(0, ...scored.flatMap((item) => item.scores));
        const decision = max >= rules.stripAt ? "strip" : max >= rules.flagAt ? "flag" : "pass";
        const mode = acts ? "block" : "observe";
        recordDecision(call, { guard: "source", rule: `detector:${detector.name}`, decision, mode, score: max });
        return max;
    };
    const fail = (): void => {
        const { runId, stepId, agent, tool } = call;
        record({ type: "warning", runId, stepId, agent, at: now(), code: "detector_error", tool });
    };
    if (!acts) {
        void scoring.then(report, fail);
        return shown;
    }
    try {
        const scored = await withTimeout(scoring, DETECTOR_TIMEOUT_MS);
        const max = report(scored);
        // Each text with a risky chunk, without its risky chunks
        const kept = new Map(
            scored
                .filter((item) => item.scores.some((value) => value >= rules.stripAt))
                .map((item) => [
                    item.text,
                    item.chunks.filter((_, index) => (item.scores[index] as number) < rules.stripAt).join("\n\n"),
                ]),
        );
        const output = kept.size === 0 ? shown.output : mapStrings(shown.output, (text) => kept.get(text) ?? text);
        return withFlags({ output, label: shown.label }, max >= rules.flagAt ? ["detector"] : []);
    } catch {
        fail();
        return shown;
    }
}

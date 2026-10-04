import type { DamageKind, ModelCallRecord, StoredReplay, StoredVerdict } from "@quard/db";
import { costOf } from "@quard/shared";
import { costOfStep, keysOf, type StoredRun } from "../rootcause/run.ts";
import { replayBody } from "./body.ts";
import { rebuildRequest } from "./request.ts";
import type { Side } from "./rounds.ts";
import { standInsOf, withStandIns } from "./standins.ts";
import { NOT_A_TOOL_RESULT, withoutContent } from "./without.ts";

export const NO_SUSPECT = "Nothing to replay: the verdict found no suspect content to leave out";

type Body = Record<string, unknown>;

// Replay counts reruns that ask for the harmful call, so it needs one
export const NOT_A_CALL: Record<DamageKind, string> = {
    detection: "Replay limited: a guard flagged the content, and the agent made no harmful call to test",
    limit: "Replay limited: the run went over a run limit, and the agent made no harmful call to test",
};

export type ReplayPlan = {
    // The model, the call that counts as harm and the content left out
    base: Pick<StoredReplay, "model" | "harmfulCall" | "removed">;
    // The two requests to resend, with the map from stand-in keys back to
    // stored keys; or why replay can't run, in plain words
    ready: { bodies: Record<Side, Body>; back: Map<string, string[]> } | string;
    // What the first round will likely cost, when the turning call's cost
    // is known. Else what the warm-up pair will likely cost, when the
    // model's price is known.
    firstRoundUsd: number | undefined;
};

// Hosts and domains also match calls that never used the content
const BROAD = /^(host|domain):/;

// The same tool counts as harm with: the entry's value; else values of the
// damaging call that came from the run's content; else, when the model made
// every value up (such as a mistyped IBAN), a value the suspect content holds
function harmKeys(verdict: StoredVerdict, run: Pick<StoredRun, "steps" | "labels">): string[] {
    const { entry, damage, values } = verdict;
    if (entry.key !== null) {
        return [entry.key];
    }
    const traced = values.filter((value) => !value.generated).map((value) => value.key);
    const held = run.labels
        .filter((label) => entry.contentId !== null && label.contentId === entry.contentId)
        .flatMap((label) => label.keys)
        .filter((key) => !BROAD.test(key));
    const own = run.steps.filter((step) => step.stepId === damage.stepId).flatMap(keysOf);
    return traced.length > 0 ? traced : held.length > 0 ? held : own;
}

// The tool call whose result held the suspect content. Across agents, when
// the turning call never read that result, the message that carried it in.
function suspectCall(
    verdict: StoredVerdict,
    run: Pick<StoredRun, "steps">,
    input: unknown[],
): { callId: string; origin: string; without: unknown[] } | undefined {
    const callOf = (stepId: string) =>
        run.steps.find((step) => step.stepId === stepId && step.kind === "tool_call" && step.callId !== null)?.callId ??
        undefined;
    const handoff = verdict.acrossAgents?.handoff;
    const tries = [
        { callId: callOf(verdict.entry.stepId), origin: verdict.entry.origin },
        { callId: handoff ? callOf(handoff.stepId) : undefined, origin: `agent:${handoff?.from}` },
    ];
    for (const { callId, origin } of tries) {
        const without = callId === undefined ? undefined : withoutContent(input, callId);
        if (callId !== undefined && without !== undefined) {
            return { callId, origin, without };
        }
    }
    return undefined;
}

// Room for the answer when a rerun's cost is guessed
const OUTPUT_TOKENS = 1_000;

// ponytail: about 4 characters a token, a rough guess at one rerun's cost
// for calls that recorded none; count tokens if the cap needs to be exact
function rerunUsd(body: Body): number | undefined {
    const inputTokens = Math.ceil(JSON.stringify(body).length / 4);
    return costOf(String(body.model), { inputTokens, cachedTokens: 0, outputTokens: OUTPUT_TOKENS }) ?? undefined;
}

// Everything a replay needs, from the verdict and what the run recorded
export function planReplay(
    verdict: StoredVerdict,
    run: Pick<StoredRun, "steps" | "labels">,
    calls: ModelCallRecord[],
): ReplayPlan {
    const { entry, turning, damage } = verdict;
    const cost = run.steps
        .filter((step) => step.stepId === turning.stepId)
        .map(costOfStep)
        .find((usd) => usd !== undefined);
    const base = {
        model: calls.find((call) => call.stepId === turning.stepId)?.model ?? "",
        harmfulCall: { tool: damage.tool, keys: harmKeys(verdict, run) },
        removed: { contentId: entry.contentId, origin: entry.origin, callId: null as string | null },
    };
    const plan = { base, firstRoundUsd: cost === undefined ? undefined : 10 * cost };
    if (damage.kind !== undefined) {
        return { ...plan, ready: NOT_A_CALL[damage.kind] };
    }
    if (entry.contentId === null) {
        return { ...plan, ready: NO_SUSPECT };
    }
    const request = rebuildRequest(calls, turning.stepId);
    if (typeof request === "string") {
        return { ...plan, ready: request };
    }
    const body = replayBody(request);
    const suspect = suspectCall(verdict, run, body.input as unknown[]);
    if (suspect === undefined) {
        return { ...plan, ready: NOT_A_TOOL_RESULT };
    }
    base.removed = { contentId: entry.contentId, origin: suspect.origin, callId: suspect.callId };
    const without = suspect.without;
    const standIns = standInsOf([...run.labels.flatMap((label) => label.keys), ...run.steps.flatMap(keysOf)]);
    const bodies = { with: withStandIns(body, standIns), without: withStandIns({ ...body, input: without }, standIns) };
    const guess = rerunUsd(bodies.with);
    return {
        base,
        firstRoundUsd: plan.firstRoundUsd ?? (guess === undefined ? undefined : 2 * guess),
        ready: { bodies, back: new Map(standIns.map((item) => [item.asKey, item.keys])) },
    };
}

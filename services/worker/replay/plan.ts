import type { ModelCallRecord, StoredReplay, StoredVerdict } from "@quard/db";
import { costOf } from "@quard/shared";
import { costOfStep, keysOf, type StoredRun } from "../rootcause/run.ts";
import { replayBody } from "./body.ts";
import { rebuildRequest } from "./request.ts";
import type { Side } from "./rounds.ts";
import { standInsOf, withStandIns } from "./standins.ts";
import { NOT_A_TOOL_RESULT, withoutContent } from "./without.ts";

type Body = Record<string, unknown>;

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
    const stepsOf = (stepId: string) => run.steps.filter((step) => step.stepId === stepId);
    // The tool call whose result held the suspect content
    const source = stepsOf(entry.stepId).filter((step) => step.kind === "tool_call" && entry.contentId !== null);
    const callId = source.map((step) => step.callId).find((id) => id !== null) ?? null;
    const cost = stepsOf(turning.stepId)
        .map(costOfStep)
        .find((usd) => usd !== undefined);
    const base = {
        model: calls.find((call) => call.stepId === turning.stepId)?.model ?? "",
        harmfulCall: {
            tool: damage.tool,
            keys: entry.key === null ? stepsOf(damage.stepId).flatMap(keysOf) : [entry.key],
        },
        removed: { contentId: entry.contentId, origin: entry.origin, callId },
    };
    const plan = { base, firstRoundUsd: cost === undefined ? undefined : 10 * cost };
    const request = rebuildRequest(calls, turning.stepId);
    if (typeof request === "string") {
        return { ...plan, ready: request };
    }
    const body = replayBody(request);
    const without = withoutContent(body.input as unknown[], callId);
    if (without === undefined) {
        return { ...plan, ready: NOT_A_TOOL_RESULT };
    }
    const standIns = standInsOf([...run.labels.flatMap((label) => label.keys), ...run.steps.flatMap(keysOf)]);
    const bodies = { with: withStandIns(body, standIns), without: withStandIns({ ...body, input: without }, standIns) };
    const guess = rerunUsd(bodies.with);
    return {
        base,
        firstRoundUsd: plan.firstRoundUsd ?? (guess === undefined ? undefined : 2 * guess),
        ready: { bodies, back: new Map(standIns.map((item) => [item.asKey, item.keys])) },
    };
}

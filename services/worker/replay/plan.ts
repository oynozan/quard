import type { ModelCallRecord, StoredReplay, StoredVerdict } from "@quard/db";
import { costOfStep, keysOf, type StoredRun } from "../rootcause/run.ts";
import { replayBody } from "./body.ts";
import { rebuildRequest } from "./request.ts";
import type { Side } from "./rounds.ts";
import { standInsOf, withStandIns } from "./standins.ts";
import { suspectCallIds } from "./suspects.ts";
import { NOT_A_TOOL_RESULT, withoutContent } from "./without.ts";

type Body = Record<string, unknown>;

export type ReplayPlan = {
    // The model, the call that counts as harm and the content left out
    base: Pick<StoredReplay, "model" | "harmfulCall" | "removed">;
    // The two requests to resend, with the map from stand-in keys back to
    // stored keys; or why replay can't run, in plain words
    ready: { bodies: Record<Side, Body>; back: Map<string, string> } | string;
    // What the first round will likely cost, when the turning call's price is known
    firstRoundUsd: number | undefined;
};

// Everything a replay needs, from the verdict and what the run recorded
export function planReplay(verdict: StoredVerdict, run: StoredRun, calls: ModelCallRecord[]): ReplayPlan {
    const { entry, turning, damage } = verdict;
    const stepsOf = (stepId: string) => run.steps.filter((step) => step.stepId === stepId);
    const cost = stepsOf(turning.stepId)
        .map(costOfStep)
        .find((usd) => usd !== undefined);
    const request = rebuildRequest(calls, turning.stepId);
    const body = typeof request === "string" ? request : replayBody(request);
    // The tool result left out is the first suspect the turning request holds
    const suspects = suspectCallIds(verdict, run);
    const without = typeof body === "string" ? undefined : withoutContent(body.input as unknown[], suspects);
    const base = {
        model: calls.find((call) => call.stepId === turning.stepId)?.model ?? "",
        harmfulCall: {
            tool: damage.tool,
            keys: entry.key === null ? stepsOf(damage.stepId).flatMap(keysOf) : [entry.key],
        },
        removed: { contentId: entry.contentId, origin: entry.origin, callId: without?.callId ?? suspects[0] ?? null },
    };
    const plan = { base, firstRoundUsd: cost === undefined ? undefined : 10 * cost };
    if (typeof body === "string") {
        return { ...plan, ready: body };
    }
    if (without === undefined) {
        return { ...plan, ready: NOT_A_TOOL_RESULT };
    }
    const standIns = standInsOf([...run.labels.flatMap((label) => label.keys), ...run.steps.flatMap(keysOf)]);
    const bodies = {
        with: withStandIns(body, standIns),
        without: withStandIns({ ...body, input: without.input }, standIns),
    };
    return { ...plan, ready: { bodies, back: new Map(standIns.map((item) => [item.asKey, item.key])) } };
}

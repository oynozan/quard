import type { IncidentRow, StoredRound, StoredVerdict } from "@quard/db";
import { originTitle } from "../../approvals/live/influence";
import type { RunDetail } from "../../runs/types";
import type { ReplayStatus } from "../../types";
import type { Replay, ReplayCount, ReplayRound } from "../types";

// Confirmed below this p, as the worker's replay/outcome.ts decides
const THRESHOLD = 0.0182;

type ReplayFields = Pick<IncidentRow, "replayState" | "replay">;

// "running" only while the worker has the replay; a limit wins over the stored state
export function replayStatus(row: ReplayFields): ReplayStatus {
    if (row.replayState === "requested" || row.replayState === "running") return "running";
    if (row.replay?.limited) return "limited";
    if (row.replayState === "failed") return "failed";
    return row.replay?.outcome ?? "not started";
}

const add = (a: ReplayCount, b: ReplayCount): ReplayCount => ({
    runs: a.runs + b.runs,
    harmful: a.harmful + b.harmful,
});

// The worker stores each round's own counts; the page also shows the totals so far
function roundsOf(rounds: StoredRound[]): ReplayRound[] {
    return rounds.reduce<ReplayRound[]>((list, round, index) => {
        const before = list.at(-1);
        const next: ReplayRound = {
            round: index + 1,
            withContent: round.with,
            withoutContent: round.without,
            totalWith: before ? add(before.totalWith, round.with) : round.with,
            totalWithout: before ? add(before.totalWithout, round.without) : round.without,
            pValue: round.pValue,
            costUsd: round.costUsd,
            finishedAt: Date.parse(round.finishedAt),
        };
        return [...list, next];
    }, []);
}

// "payInvoice with iban GB33…5555" from stored keys such as "iban:GB33…5555#<hash>"
function callText(tool: string, keys: string[]): string {
    const values = keys.map((key) => key.split("#")[0].replace(":", " "));
    return values.length > 0 ? `${tool} with ${values.join(", ")}` : tool;
}

// Before the first replay, the setup comes from the verdict and the turning point
export function replayOf(row: IncidentRow, verdict: StoredVerdict, run: RunDetail): Replay {
    const stored = row.replay;
    const turning = run.steps.find((step) => step.id === verdict.turning.stepId);
    const keys = [verdict.entry.key].filter((key): key is string => key !== null);
    const call = stored?.harmfulCall ?? { tool: verdict.damage.tool, keys };
    return {
        status: replayStatus(row),
        rounds: roundsOf(stored?.rounds ?? []),
        threshold: THRESHOLD,
        model: stored?.model ?? turning?.name ?? "",
        harmfulCall: callText(call.tool, call.keys),
        removedContent: `Content from ${originTitle(stored?.removed.origin ?? verdict.entry.origin)}`,
        costUsd: row.spentUsd,
        capUsd: row.capUsd,
        reason: stored?.limited ?? stored?.error ?? null,
    };
}

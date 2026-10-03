"use client";

import { ChartPane } from "@/components/charts/chart-pane";
import { ChartTable } from "@/components/charts/chart-table";
import { CellMeter } from "@/components/charts/cell-meter";
import { StatusSquare } from "@/components/kit/labels";
import { DetailList, DetailRow } from "@/components/kit/detail/detail-list";
import { Notice, WarningRule } from "@/components/kit/feedback/feedback";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { Replay, ReplayRound } from "@/lib/data/incidents/types";
import { formatCost, formatP, REPLAY_TONE, REPLAY_WORD } from "../lib/labels";
import { Disclosure } from "./disclosure";
import { RoundCells } from "./round-cells";
import { useReplay } from "./replay-context";

const ROW = "grid grid-cols-[72px_auto_auto_minmax(0,1fr)] items-center gap-x-[18px] max-[560px]:gap-x-3";

function statusWord(replay: Replay, running: boolean): string {
    if (running || replay.inProgress) return `Replaying round ${replay.rounds.length + 1}…`;
    if (replay.status === "running") return "Not decided yet";
    return REPLAY_WORD[replay.status];
}

function summary(replay: Replay): string {
    const last = replay.rounds.at(-1);
    if (!last) return "No replay rounds yet.";
    return `${replay.rounds.length} rounds. Harmful with the content ${last.totalWith.harmful} of ${last.totalWith.runs}, without ${last.totalWithout.harmful} of ${last.totalWithout.runs}. p ${formatP(last.pValue)}.`;
}

export function ReplayResults() {
    const { replay, running } = useReplay();
    const last = replay.rounds.at(-1);
    const busy = running || replay.inProgress;
    const pending = busy ? replay.rounds.length + 1 : null;
    const rows = replay.rounds.map((round) => ({
        key: String(round.round),
        cells: [
            `Round ${round.round}`,
            `${round.withContent.harmful} / 5`,
            `${round.withoutContent.harmful} / 5`,
            formatP(round.pValue),
            formatCost(round.costUsd),
        ],
    }));

    return (
        <ChartPane
            title="Replay results"
            tag={`${replay.rounds.length} × 5 + 5`}
            readouts={[
                {
                    label: "With",
                    value: last ? `${last.totalWith.harmful}/${last.totalWith.runs}` : "—",
                    suffix: "harmful",
                },
                {
                    label: "Without",
                    value: last ? `${last.totalWithout.harmful}/${last.totalWithout.runs}` : "—",
                    suffix: "harmful",
                },
                { label: "p", value: last ? formatP(last.pValue) : "—", suffix: `vs ${replay.threshold}` },
            ]}
            table={
                <ChartTable
                    caption="Replay rounds"
                    height={Math.max(150, 30 + 28 * rows.length)}
                    columns={[
                        { label: "Round" },
                        { label: "With" },
                        { label: "Without" },
                        { label: "p" },
                        { label: "Cost" },
                    ]}
                    rows={rows}
                    emptyText="No rounds yet"
                />
            }
        >
            <p aria-live="polite" className="mb-4 inline-flex items-center gap-2 text-[13px] text-ink">
                {busy ? <Spinner /> : <StatusSquare tone={REPLAY_TONE[replay.status]} />}
                {statusWord(replay, running)}
            </p>

            <div role="img" aria-label={summary(replay)} className="flex flex-col gap-[10px]">
                <div className={`${ROW} text-[11px] text-ink-muted`}>
                    <span>Round</span>
                    <span>With</span>
                    <span>Without</span>
                    <span className="text-right">p after round</span>
                </div>
                {replay.rounds.map((round) => (
                    <RoundRow key={round.round} round={round} threshold={replay.threshold} />
                ))}
                {pending ? (
                    <div className={ROW}>
                        <span className="mono text-[12px] text-ink-2">Round {pending}</span>
                        <RoundCells harmful={0} tone="signal" pending />
                        <RoundCells harmful={0} tone="context" pending />
                        <span className="text-right text-[12px] text-ink-muted">Running…</span>
                    </div>
                ) : null}
            </div>

            <CostBlock replay={replay} />

            {replay.limited && replay.limitedReason ? <Notice className="mt-4">{replay.limitedReason}.</Notice> : null}
            {replay.capReached ? (
                <WarningRule className="mt-4" title="Cost cap reached" note="Raise the cap in Settings to continue." />
            ) : null}

            <Disclosure label="Setup" className="mt-4">
                <DetailList className="border-t border-line">
                    <DetailRow term="Model" mono>
                        {replay.model}
                    </DetailRow>
                    <DetailRow term="Counts as harmful" mono title={replay.harmfulCall}>
                        <span className="block truncate">{replay.harmfulCall}</span>
                    </DetailRow>
                    <DetailRow term="Left out without" title={replay.removedContent}>
                        <span className="block truncate">{replay.removedContent}</span>
                    </DetailRow>
                </DetailList>
            </Disclosure>
        </ChartPane>
    );
}

function RoundRow({ round, threshold }: { round: ReplayRound; threshold: number }) {
    const passed = round.pValue < threshold;
    return (
        <div className={ROW}>
            <span className="mono text-[12px] text-ink-2">Round {round.round}</span>
            <span className="flex items-center gap-2">
                <RoundCells harmful={round.withContent.harmful} tone="signal" />
                <span className="mono text-[12px] text-ink-2">{round.withContent.harmful}/5</span>
            </span>
            <span className="flex items-center gap-2">
                <RoundCells harmful={round.withoutContent.harmful} tone="context" />
                <span className="mono text-[12px] text-ink-2">{round.withoutContent.harmful}/5</span>
            </span>
            <span className="mono text-right text-[12px] text-ink">
                {formatP(round.pValue)}
                <span className="sr-only">{passed ? ", below the threshold" : ", not below the threshold"}</span>
                <span aria-hidden className={cn("ml-2 max-[560px]:hidden", passed ? "text-ink" : "text-ink-faint")}>
                    {passed ? "<" : "≥"} {threshold}
                </span>
            </span>
        </div>
    );
}

function CostBlock({ replay }: { replay: Replay }) {
    return (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line pt-4">
            <span className="text-[12px] text-ink-muted">
                Cost <span className="mono text-[13px] text-ink">{formatCost(replay.costUsd)}</span> /{" "}
                <span className="mono">{formatCost(replay.capUsd)}</span> cap
            </span>
            <CellMeter
                value={replay.costUsd}
                max={replay.capUsd}
                cells={20}
                width={196}
                label={`${formatCost(replay.costUsd)} of the ${formatCost(replay.capUsd)} cap spent`}
            />
        </div>
    );
}

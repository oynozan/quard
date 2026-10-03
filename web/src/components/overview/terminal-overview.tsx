import { CellTrace } from "@/components/charts/cell-trace";
import { FitMeter, FitSparkline } from "@/components/charts/fit";
import { CrossGlyph, WarningGlyph } from "@/components/icons/glyphs";
import { PaneHeader } from "@/components/kit/pane";
import { formatCompact, formatInt, padCount } from "@/lib/format";
import type { OverviewData } from "@/lib/data/overview";
import type { ReactNode } from "react";

type TerminalOverviewProps = Pick<OverviewData, "runsPerHour" | "coverage" | "blockRate" | "decisions24h">;

// Square panes tiled with shared hairlines, like a terminal split into windows
export function TerminalOverview({ runsPerHour, coverage, blockRate, decisions24h }: TerminalOverviewProps) {
    const hours = runsPerHour.length > 0 ? runsPerHour : Array<number>(24).fill(0);
    const runs24h = hours.reduce((sum, v) => sum + v, 0);
    const lastHour = hours[hours.length - 1];

    return (
        <div
            className="terminal-grid reveal mt-7 max-[760px]:mt-[22px]"
            style={{ animationDelay: "40ms" }}
            aria-label="Summary"
        >
            <section className="terminal-pane" data-area="a" style={{ gridArea: "a" }} aria-label="Runs">
                <PaneHeader title="Runs" tag="24H" />
                <Counter value={formatInt(runs24h)} />
                <LowerBlock label="Per hour" value={`${lastHour} now`}>
                    <FitSparkline
                        values={hours}
                        rows={2}
                        cell={7}
                        label={`Runs per hour over the last 24 hours, ${lastHour} in the last hour`}
                    />
                </LowerBlock>
            </section>

            <section className="terminal-pane" data-area="b" style={{ gridArea: "b" }} aria-label="Guarded tools">
                <PaneHeader title="Guarded tools" tag="24H" />
                <Counter value={padCount(coverage.guarded)} />
                <LowerBlock label="Guarded / seen" value={`${coverage.guarded} / ${coverage.seen}`}>
                    <FitMeter
                        value={coverage.guarded}
                        max={coverage.seen}
                        cells={24}
                        label={`${coverage.guarded} of ${coverage.seen} tools the agents use are guarded`}
                    />
                </LowerBlock>
            </section>

            <div className="terminal-pane" data-area="c" style={{ gridArea: "c" }}>
                <CellTrace
                    title="Block rate"
                    values={blockRate.values}
                    startAt={blockRate.startAt}
                    limit={blockRate.limit}
                    limitLabel="Review at"
                    emptyText="No guarded tool calls in the last 30 days"
                />
            </div>

            <section className="terminal-pane" data-area="d" style={{ gridArea: "d" }} aria-label="Guard decisions">
                <PaneHeader title="Guard decisions" tag="24H" />
                <div className="grid flex-1 grid-cols-2">
                    <SplitCell
                        icon={<CrossGlyph className="text-danger" />}
                        label="Blocked"
                        value={decisions24h.blocked}
                    />
                    <SplitCell
                        icon={<WarningGlyph className="text-warning" />}
                        label="Asked a human"
                        value={decisions24h.asked}
                        divided
                    />
                </div>
            </section>
        </div>
    );
}

function Counter({ value }: { value: string }) {
    return (
        <div className="flex flex-1 items-center px-3">
            <span className="mono text-[32px] leading-none text-ink">{value}</span>
        </div>
    );
}

function LowerBlock({ label, value, children }: { label: string; value: string; children: ReactNode }) {
    return (
        <div className="flex h-[54px] flex-col justify-end px-3 pb-3">
            <div className="mb-[9px] flex items-baseline justify-between gap-2 text-[11px] leading-[1.55] text-ink-muted max-[760px]:text-[10px]">
                <span className="font-light">{label}</span>
                <span className="mono">{value}</span>
            </div>
            {children}
        </div>
    );
}

function SplitCell({
    icon,
    label,
    value,
    divided,
}: {
    icon: ReactNode;
    label: string;
    value: number;
    divided?: boolean;
}) {
    return (
        <div
            className={`flex items-center justify-between gap-[10px] px-4 py-3 ${divided ? "border-l border-line" : ""}`}
        >
            <span className="inline-flex items-center gap-[9px] text-[11px] font-light text-ink-muted">
                {icon}
                {label}
            </span>
            <span className="mono text-[28px] leading-[1.4] text-ink" title={formatCompact(value)}>
                {padCount(value)}
            </span>
        </div>
    );
}

"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { traceLayout } from "@/lib/charts/trace";
import { formatPercent, formatShortDate } from "@/lib/format";
import { DAY } from "@/lib/data/rng";
import { useWidth } from "@/lib/hooks/use-width";
import { WarningGlyph } from "@/components/icons/glyphs";
import { ChartTooltip, TableToggle } from "./chart-parts";

const AXIS = 40;
const CELL = 4;
const ROWS = 24;

type CellTraceProps = {
    title: string;
    values: number[];
    startAt: number;
    limit: number;
    limitLabel: string;
};

// A rate over time, rasterized onto cells, against a dashed limit.
export function CellTrace({ title, values, startAt, limit, limitLabel }: CellTraceProps) {
    const [ref, width] = useWidth<HTMLDivElement>(464);
    const [hover, setHover] = useState<number | null>(null);
    const [table, setTable] = useState(false);

    const columns = Math.max(20, Math.floor((width - AXIS + 2) / (CELL + 2)));
    const layout = traceLayout({ values, columns, rows: ROWS, cell: CELL, limit });
    // A limit is always given, so the layout always places its line
    const limitY = layout.limitY! + 0.5;
    const dayOf = (i: number) => startAt + i * DAY;
    const today = values[values.length - 1];
    const peak = values.indexOf(Math.max(...values));
    const breach = values[peak] > limit ? peak : null;

    const indexAt = (x: number) =>
        Math.min(values.length - 1, Math.max(0, Math.round((x / layout.width) * (values.length - 1))));

    function onPointerMove(event: PointerEvent<SVGSVGElement>) {
        setHover(indexAt(event.clientX - event.currentTarget.getBoundingClientRect().left));
    }

    function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
        const last = values.length - 1;
        const current = hover ?? last;
        const next: Record<string, number> = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: last };
        if (event.key === "Escape") return setHover(null);
        if (!(event.key in next)) return;
        event.preventDefault();
        setHover(Math.min(last, Math.max(0, next[event.key])));
    }

    const hoverColumn = hover === null ? null : layout.columnOf(hover);
    const summary = `${title} per day over 30 days. ${breach === null ? "Never" : "Once"} over the ${formatPercent(
        limit,
    )} limit${breach === null ? "" : `: ${formatPercent(values[breach])} on ${formatShortDate(dayOf(breach))}`}. Today ${formatPercent(today)}.`;

    return (
        <section aria-label={title} className="flex h-full flex-col">
            <header className="flex min-h-[38px] items-center justify-between gap-2 border-b border-line bg-recess px-3">
                <h2 className="text-[12px] font-light text-ink-link">{title}</h2>
                <div className="flex items-center gap-3">
                    <span className="mono text-[11px] leading-none text-ink-muted">30D</span>
                    <span aria-hidden className="h-3 w-px bg-line" />
                    <TableToggle pressed={table} onToggle={() => setTable(!table)} />
                </div>
            </header>

            <div ref={ref} className="relative flex-1 p-3">
                {table ? (
                    <TraceTable values={values} dayOf={dayOf} limit={limit} />
                ) : (
                    <>
                        <div className="mb-3 flex items-center gap-5 text-[11px] font-light text-ink-muted">
                            <span className="inline-flex items-center gap-[7px]">
                                <span aria-hidden className="flex gap-[2px]">
                                    <span className="size-1 bg-signal" />
                                    <span className="size-1 bg-signal" />
                                </span>
                                Today{" "}
                                <span className="mono text-[12px] font-normal text-ink">{formatPercent(today)}</span>
                            </span>
                            <span className="inline-flex items-center gap-[7px]">
                                <span aria-hidden className="w-[13px] border-t border-dashed border-warning" />
                                {limitLabel}{" "}
                                <span className="mono text-[12px] font-normal text-ink">{formatPercent(limit)}</span>
                            </span>
                        </div>

                        <div className="relative">
                            <div
                                aria-hidden
                                className="mono absolute top-0 left-0 w-[34px] text-right text-[10px] leading-[10px] text-ink-muted"
                            >
                                {layout.ticks.map((tick) => (
                                    <span key={tick.value} className="absolute right-0" style={{ top: tick.y - 5 }}>
                                        {tick.value}%
                                    </span>
                                ))}
                                <span className="absolute right-0" style={{ top: layout.height - 10 }}>
                                    0%
                                </span>
                            </div>
                            <svg
                                role="img"
                                aria-label={summary}
                                tabIndex={0}
                                width={layout.width}
                                height={layout.height}
                                shapeRendering="crispEdges"
                                className="block outline-offset-[6px]"
                                style={{ marginLeft: AXIS }}
                                onPointerMove={onPointerMove}
                                onPointerLeave={() => setHover(null)}
                                onKeyDown={onKeyDown}
                                onBlur={() => setHover(null)}
                            >
                                <path d={layout.field} fill="var(--chart-field)" />
                                {hoverColumn !== null ? (
                                    <rect
                                        x={hoverColumn * layout.pitch}
                                        y={0}
                                        width={CELL}
                                        height={layout.height}
                                        fill="var(--highlight)"
                                    />
                                ) : null}
                                <path d={layout.lit} fill="var(--signal)" />
                                <path d={layout.over} fill="var(--warning)" />
                                <line
                                    x1={0}
                                    x2={layout.width}
                                    y1={limitY}
                                    y2={limitY}
                                    stroke="var(--warning)"
                                    strokeDasharray={`${CELL} 2`}
                                />
                            </svg>
                            {breach !== null ? (
                                <span
                                    className="mono absolute top-[-2px] inline-flex items-center gap-1 bg-page whitespace-nowrap px-[6px] text-[10px] leading-[14px] text-ink"
                                    style={{ left: AXIS + layout.columnOf(breach) * layout.pitch + 3 * layout.pitch }}
                                >
                                    <WarningGlyph size={10} className="text-warning" />
                                    {formatPercent(values[breach])}{" "}
                                    <span className="text-ink-muted">· {formatShortDate(dayOf(breach))}</span>
                                </span>
                            ) : null}
                            {hover !== null ? (
                                <ChartTooltip
                                    x={
                                        AXIS +
                                        layout.columnOf(hover) * layout.pitch +
                                        (hover > values.length / 2 ? -10 : 14)
                                    }
                                    y={12}
                                    alignRight={hover > values.length / 2}
                                    value={formatPercent(values[hover])}
                                    unit="blocked"
                                    caption={formatShortDate(dayOf(hover))}
                                    keyColor={values[hover] > limit ? "var(--warning)" : "var(--mint)"}
                                />
                            ) : null}
                        </div>

                        <div
                            aria-hidden
                            className="mono mt-[6px] flex justify-between text-[10px] text-ink-muted"
                            style={{ marginLeft: AXIS, width: layout.width }}
                        >
                            <span>{formatShortDate(dayOf(0))}</span>
                            <span>{formatShortDate(dayOf(values.length - 1))}</span>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}

type TraceTableProps = { values: number[]; dayOf: (i: number) => number; limit: number };

function TraceTable({ values, dayOf, limit }: TraceTableProps) {
    return (
        <div className="table-scroll max-h-[190px] overflow-y-auto">
            <table className="w-full text-left">
                <thead className="sticky top-0 bg-recess text-[11px] text-ink-muted">
                    <tr>
                        <th className="h-[30px] px-3 font-normal">Day</th>
                        <th className="h-[30px] px-3 text-right font-normal">Block rate</th>
                        <th className="h-[30px] px-3 text-right font-normal">Over the limit</th>
                    </tr>
                </thead>
                <tbody className="mono text-[12px]">
                    {[...values].reverse().map((value, n) => {
                        const i = values.length - 1 - n;
                        return (
                            <tr key={i} className="h-[28px] border-b border-line last:border-0">
                                <td className="px-3 text-ink-2">{formatShortDate(dayOf(i))}</td>
                                <td className="px-3 text-right text-ink">{formatPercent(value)}</td>
                                <td className="px-3 text-right text-ink-muted">{value > limit ? "Yes" : "—"}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

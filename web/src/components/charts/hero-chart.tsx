"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { Greeting } from "@/components/overview/greeting";
import { columnOverlay } from "@/lib/charts/cells";
import { heroLayout, HERO_DATA_ROWS } from "@/lib/charts/hero";
import { formatClock, formatCompact, formatInt } from "@/lib/format";
import { useWidth } from "@/lib/hooks/use-width";
import { DAY, MINUTE } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ChartTooltip, HeaderDivider, LiveMark, Readout, TableToggle } from "./chart-parts";
import { FieldMessage } from "./field-parts";
import { sansWidth } from "./layout/format";
import { centerKnockout } from "./layout/sweep";

const BUCKET_MS = 10 * MINUTE;
const EMPTY = "No model calls in the last 24 hours";

type HeroChartProps = {
    greeting: string;
    values: number[];
    endsAt: number;
    live?: boolean;
};

// The greeting over the last 24 hours of model calls as green cell columns
export function HeroChart({ greeting, values: given, endsAt, live = true }: HeroChartProps) {
    const [ref, width] = useWidth<HTMLDivElement>(978);
    const [hover, setHover] = useState<number | null>(null);
    const [table, setTable] = useState(false);

    const values = given.length > 0 ? given : Array<number>(DAY / BUCKET_MS).fill(0);
    const total = values.reduce((sum, v) => sum + v, 0);
    const empty = total === 0;
    const startsAt = endsAt - values.length * BUCKET_MS;
    const layout = heroLayout(values, Math.max(240, width));
    const { field, buckets, bucketSize, peak } = layout;
    const span = bucketSize * BUCKET_MS;
    const bucketStart = (i: number) => startsAt + i * span;
    const per = bucketSize === 1 ? "10 min" : `${bucketSize * 10} min`;
    const overlay = hover === null ? null : columnOverlay(field, hover, buckets[hover], layout.unit, HERO_DATA_ROWS);

    const xLabels = [0, 0.25, 0.5, 0.75].map((share) => Math.round(buckets.length * share));
    const nearHover = (index: number) => hover !== null && Math.abs(hover - index) * field.pitch < 34;
    const tip =
        hover === null
            ? null
            : {
                  x: field.columnX[hover] + (hover > buckets.length / 2 ? -10 : field.pitch + 10),
                  y: Math.max(0, field.height - (buckets[hover] / layout.unit) * field.pitch - 52),
                  alignRight: hover > buckets.length / 2,
              };
    const columnAt = (clientX: number, left: number) =>
        Math.min(buckets.length - 1, Math.max(0, Math.floor((clientX - left) / field.pitch)));

    function onPointerMove(event: PointerEvent<SVGSVGElement>) {
        setHover(columnAt(event.clientX, event.currentTarget.getBoundingClientRect().left));
    }

    function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
        const last = buckets.length - 1;
        const current = hover ?? last;
        const next: Record<string, number> = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: last };
        if (event.key === "Escape") return setHover(null);
        if (!(event.key in next)) return;
        event.preventDefault();
        setHover(Math.min(last, Math.max(0, next[event.key])));
    }

    const clear = () => setHover(null);
    const reading = empty ? {} : { onPointerMove, onPointerLeave: clear, onKeyDown, onBlur: clear };
    const summary = `Model calls per ${per} over the last 24 hours. Peak ${formatInt(peak.value)} at ${formatClock(
        bucketStart(peak.index),
    )}, now ${formatInt(buckets[buckets.length - 1])}.`;

    return (
        <section aria-label="Model calls in the last 24 hours" className="reveal">
            <div className="mb-[18px] flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <Greeting text={greeting} />
                <div className="flex items-center gap-[14px] pb-[5px]">
                    <Readout label={`Model calls per ${per}`} value={empty ? "—" : formatInt(total)} suffix="in 24h" />
                    <LiveMark live={live} />
                    <HeaderDivider />
                    <TableToggle pressed={table} onToggle={() => setTable(!table)} />
                </div>
            </div>

            <div ref={ref} className="group relative">
                {table ? (
                    <HeroTable buckets={empty ? [] : buckets} bucketStart={bucketStart} height={field.height} />
                ) : (
                    <>
                        {/* Y ticks hang in the page gutter and show while the chart is hovered or focused */}
                        <div
                            aria-hidden
                            className={cn(
                                "mono pointer-events-none absolute top-0 right-[calc(100%+8px)] text-right text-[10px] leading-[10px] whitespace-nowrap text-ink-muted",
                                "opacity-0 transition-opacity duration-[160ms] group-hover:opacity-100 group-has-[:focus-visible]:opacity-100",
                                "max-[1250px]:right-[calc(100%+4px)] max-[760px]:hidden",
                                hover !== null && "opacity-100",
                            )}
                        >
                            {layout.ticks.map((tick) => (
                                <span key={tick.value} className="absolute right-0" style={{ top: tick.y - 5 }}>
                                    {empty ? "—" : formatCompact(tick.value)}
                                </span>
                            ))}
                            <span className="absolute right-0" style={{ top: field.height - 10 }}>
                                {empty ? "—" : "0"}
                            </span>
                        </div>

                        <svg
                            role="img"
                            aria-label={empty ? EMPTY : summary}
                            tabIndex={empty ? -1 : 0}
                            width={field.width}
                            height={field.height}
                            className="block outline-offset-[6px]"
                            shapeRendering="crispEdges"
                            {...reading}
                        >
                            <path d={field.field} fill="var(--chart-field)" />
                            {layout.ticks.map((tick) => (
                                <rect
                                    key={tick.value}
                                    x={0}
                                    y={tick.y}
                                    width={field.columnX[buckets.length]}
                                    height={1}
                                    fill="var(--chart-grid)"
                                />
                            ))}
                            <path d={field.lit.lit ?? ""} fill="var(--signal)" />
                            {overlay ? (
                                <>
                                    <path d={overlay.unlit} fill="var(--highlight)" />
                                    <path d={overlay.lit} fill="var(--mint)" />
                                </>
                            ) : null}
                            {live ? <rect className="cursor-blink" {...layout.cursor} fill="var(--signal)" /> : null}
                        </svg>

                        {empty ? (
                            <FieldMessage
                                text={EMPTY}
                                box={centerKnockout(field.width, field.height, field.pitch, sansWidth(EMPTY, 11), 15)}
                            />
                        ) : null}

                        <div
                            aria-hidden
                            className="mono relative mt-2 h-[10px] text-[10px] leading-[10px] text-ink-muted"
                        >
                            {xLabels.map((index) => (
                                <span
                                    key={index}
                                    className="absolute"
                                    style={{ left: field.columnX[index], opacity: nearHover(index) ? 0 : 1 }}
                                >
                                    {formatClock(bucketStart(index))}
                                </span>
                            ))}
                            <span
                                className="absolute"
                                style={{ left: layout.cursor.x - 6, opacity: nearHover(buckets.length) ? 0 : 1 }}
                            >
                                now
                            </span>
                            {hover !== null ? (
                                <span
                                    className="absolute text-ink"
                                    style={{ left: Math.max(0, field.columnX[hover] - 12) }}
                                >
                                    {formatClock(bucketStart(hover))}
                                </span>
                            ) : null}
                        </div>

                        {hover !== null && tip ? (
                            <ChartTooltip
                                x={tip.x}
                                y={tip.y}
                                alignRight={tip.alignRight}
                                value={formatInt(buckets[hover])}
                                unit="calls"
                                caption={`${formatClock(bucketStart(hover))}–${formatClock(bucketStart(hover) + span)}`}
                            />
                        ) : null}
                        <p className="sr-only" aria-live="polite">
                            {hover !== null ? `${buckets[hover]} calls, ${formatClock(bucketStart(hover))}` : ""}
                        </p>
                    </>
                )}
            </div>
        </section>
    );
}

type HeroTableProps = { buckets: number[]; bucketStart: (i: number) => number; height: number };

function HeroTable({ buckets, bucketStart, height }: HeroTableProps) {
    return (
        <div className="table-scroll overflow-y-auto border-y border-line" style={{ height: height + 18 }}>
            <table className="w-full text-left">
                <thead className="sticky top-0 bg-recess text-[11px] text-ink-muted">
                    <tr>
                        <th className="h-[30px] px-3 font-normal">Time</th>
                        <th className="h-[30px] px-3 text-right font-normal">Model calls</th>
                    </tr>
                </thead>
                <tbody className="mono text-[12px]">
                    {buckets.map((value, i) => (
                        <tr key={i} className="h-[28px] border-b border-line last:border-0">
                            <td className="px-3 text-ink-2">{formatClock(bucketStart(i))}</td>
                            <td className="px-3 text-right text-ink">{formatInt(value)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {buckets.length === 0 ? <p className="py-6 text-center text-[11px] text-ink-muted">{EMPTY}</p> : null}
        </div>
    );
}

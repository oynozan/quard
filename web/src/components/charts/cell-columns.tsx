"use client";

import { GAP } from "@/lib/charts/cells";
import { DAY } from "@/lib/data/rng";
import { ChartPane, type ChartState, type ReadoutItem } from "./chart-pane";
import { ChartTooltip } from "./chart-parts";
import { ChartTable } from "./chart-table";
import { FieldMessage, SweepLayer, YAxis } from "./field-parts";
import { useCursor } from "./hooks/use-cursor";
import { useFitWidth } from "./hooks/use-fit-width";
import { useSweep } from "./hooks/use-sweep";
import { AXIS, BAND_ROWS, bucketNames, columnsLayout, groupAt, groupOverlay, groupX } from "./layout/columns";
import { formatValue, monoWidth, sansWidth, unitWord, type ValueFormat } from "./layout/format";
import { centerKnockout, columnCells, sweepPaths } from "./layout/sweep";

type CellColumnsProps = {
    title: string;
    tag?: string;
    // One count per time bucket, oldest first
    values: number[];
    startAt: number;
    bucketMs: number;
    // Plural unit for readouts, such as "runs"
    unit: string;
    unitOne?: string;
    // One sentence for screen readers naming the measure, the peak and the latest value
    summary: string;
    // "last" draws history in Context Gray and only the newest group in Signal Green
    emphasis?: "all" | "last";
    // Data rows, rounded to a multiple of 3 so gridlines sit on cell boundaries
    rows?: number;
    cell?: number;
    format?: ValueFormat;
    readouts?: ReadoutItem[];
    state?: ChartState;
    emptyText?: string;
    className?: string;
};

// Counts over time as cell columns, with nearest-column hover and a table view
export function CellColumns({
    title,
    tag,
    values,
    startAt,
    bucketMs,
    unit,
    unitOne,
    summary,
    emphasis = "all",
    rows = 21,
    cell = 4,
    format = "int",
    readouts,
    state: requested = "ready",
    emptyText = "No data in this range",
    className,
}: CellColumnsProps) {
    const [ref, width] = useFitWidth<HTMLDivElement>(560);
    const state: ChartState = values.length === 0 && requested !== "loading" ? "empty" : requested;
    const ready = state === "ready" || state === "refetching";
    const count = values.length > 0 ? values.length : 24;
    const shown = ready ? values : Array.from({ length: count }, () => 0);
    const names = bucketNames(startAt, bucketMs);
    const input = {
        values: shown,
        plotWidth: Math.max(120, width - AXIS),
        dataRows: Math.max(9, Math.round(rows / 3) * 3),
        preferredCell: cell,
        emphasis,
    };
    const base = columnsLayout({ ...input, peakTextWidth: 0 });
    const top = Math.max(0, ...base.groups);
    const peakText = `${formatValue(top, format)} · ${names.axis(names.start(base.groups.indexOf(top) * base.merge))}`;
    const layout = ready && top > 0 ? columnsLayout({ ...input, peakTextWidth: monoWidth(peakText, 10) }) : base;
    const { field, pitch, groups, lit } = layout;
    const litWidth = lit * pitch - GAP;

    const groupStart = (g: number) => names.start(g * layout.merge);
    const groupEnd = (g: number) => names.start(Math.min(count, (g + 1) * layout.merge));
    const caption = (g: number) => names.caption(groupStart(g), groupEnd(g));

    const cursor = useCursor(ready ? groups.length : 0);
    const hover = cursor.index;
    const overlay = hover === null ? null : groupOverlay(layout, hover);
    const totalColumns = field.columnX.length;
    const totalRows = layout.dataRows + BAND_ROWS;
    const center = useSweep(totalColumns, state === "loading");
    const sweep = sweepPaths(center, totalColumns, (c) =>
        columnCells(field.columnX[c], field.columnW[c], totalRows, pitch),
    );

    const labelWidth = monoWidth(names.axis(startAt), 10);
    const everyGroup = groups.length <= 12 && layout.span * pitch >= labelWidth + 6;
    const marks = everyGroup
        ? groups.map((_, g) => g)
        : [...new Set([0, 1, 2, 3].map((q) => Math.round((groups.length * q) / 4)))].filter((g) => g < groups.length);
    const hoverValue = hover === null ? 0 : groups[hover];
    const right = hover !== null && hover > groups.length / 2;

    const table = (
        <ChartTable
            caption={summary}
            height={field.height + 18 + (readouts?.length ? 30 : 0)}
            columns={[{ label: bucketMs >= DAY ? "Day" : "Time" }, { label: capitalize(unit) }]}
            rows={
                ready
                    ? values.map((v, i) => ({
                          key: String(i),
                          cells: [names.caption(names.start(i), names.start(i + 1)), formatValue(v, format)],
                      }))
                    : []
            }
            emptyText={state === "loading" ? "Loading…" : emptyText}
        />
    );

    return (
        <ChartPane title={title} tag={tag} state={state} readouts={readouts} table={table} className={className}>
            <div ref={ref} className="relative">
                <YAxis
                    ticks={layout.ticks.map((t) => ({ label: formatValue(t.value, format), y: t.y }))}
                    height={field.height}
                    state={state}
                />
                <svg
                    role="img"
                    aria-label={state === "loading" ? `${title}, loading` : state === "empty" ? emptyText : summary}
                    tabIndex={ready ? 0 : -1}
                    width={field.width}
                    height={field.height}
                    shapeRendering="crispEdges"
                    className="block outline-offset-[6px]"
                    style={{ marginLeft: AXIS }}
                    onPointerMove={(event) => {
                        if (!ready) return;
                        const left = event.currentTarget.getBoundingClientRect().left;
                        cursor.setIndex(groupAt(layout, event.clientX - left));
                    }}
                    onPointerLeave={cursor.clear}
                    onKeyDown={cursor.onKeyDown}
                    onBlur={cursor.clear}
                >
                    <path d={field.field} fill="var(--chart-field)" />
                    <SweepLayer paths={sweep} />
                    {layout.ticks.map((tick) => (
                        <rect
                            key={tick.y}
                            x={0}
                            y={tick.y}
                            width={layout.dataWidth}
                            height={1}
                            fill="var(--chart-grid)"
                        />
                    ))}
                    <path
                        d={field.lit.lit ?? ""}
                        fill={emphasis === "last" ? "var(--chart-context)" : "var(--signal)"}
                    />
                    <path d={field.lit.now ?? ""} fill="var(--signal)" />
                    {overlay ? (
                        <>
                            <path d={overlay.unlit} fill="var(--highlight)" />
                            <path d={overlay.lit} fill="var(--mint)" />
                        </>
                    ) : null}
                </svg>

                {layout.peak ? (
                    <span
                        aria-hidden
                        className="mono absolute text-center text-[10px] leading-[10px] whitespace-nowrap text-ink"
                        style={{
                            left: AXIS + layout.peak.label.x,
                            width: layout.peak.label.w,
                            top: layout.peak.label.h / 2 - 5,
                        }}
                    >
                        {formatValue(layout.peak.value, format)}{" "}
                        <span className="text-ink-muted">· {names.axis(groupStart(layout.peak.index))}</span>
                    </span>
                ) : null}

                {state === "empty" ? (
                    <FieldMessage
                        text={emptyText}
                        left={AXIS}
                        box={centerKnockout(field.width, field.height, pitch, sansWidth(emptyText, 11), 15)}
                    />
                ) : null}

                <div aria-hidden className="mono relative mt-2 h-[10px] text-[10px] leading-[10px] text-ink-muted">
                    {marks.map((g) => {
                        const near =
                            !everyGroup &&
                            hover !== null &&
                            hover !== g &&
                            Math.abs(hover - g) * layout.span * pitch < 44;
                        return (
                            <span
                                key={g}
                                className={hover === g ? "absolute text-ink" : "absolute"}
                                style={{
                                    left: AXIS + groupX(layout, g),
                                    width: everyGroup ? litWidth : undefined,
                                    textAlign: everyGroup ? "center" : undefined,
                                    opacity: near ? 0 : 1,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {names.axis(groupStart(g))}
                            </span>
                        );
                    })}
                    {hover !== null && !marks.includes(hover) ? (
                        <span
                            className="absolute whitespace-nowrap text-ink"
                            style={{ left: AXIS + groupX(layout, hover) }}
                        >
                            {names.axis(groupStart(hover))}
                        </span>
                    ) : null}
                </div>

                {hover !== null ? (
                    <ChartTooltip
                        x={AXIS + groupX(layout, hover) + (right ? -10 : litWidth + 10)}
                        y={Math.max(0, field.height - (hoverValue / layout.unit) * pitch - 52)}
                        alignRight={right}
                        value={formatValue(hoverValue, format)}
                        unit={unitWord(hoverValue, unit, unitOne)}
                        caption={caption(hover)}
                    />
                ) : null}
                <p className="sr-only" aria-live="polite">
                    {hover !== null
                        ? `${formatValue(hoverValue, format)} ${unitWord(hoverValue, unit, unitOne)}, ${caption(hover)}`
                        : ""}
                </p>
            </div>
        </ChartPane>
    );
}

function capitalize(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

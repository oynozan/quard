"use client";

import { formatInt } from "@/lib/format";
import { ChartPane, type ChartState, type ReadoutItem } from "./chart-pane";
import { ChartTooltip } from "./chart-parts";
import { ChartTable } from "./chart-table";
import { FieldMessage, SweepLayer, YAxis } from "./field-parts";
import { useCursor } from "./hooks/use-cursor";
import { useFitWidth } from "./hooks/use-fit-width";
import { useSweep } from "./hooks/use-sweep";
import { AXIS, BAND_ROWS } from "./layout/columns";
import {
    formatEdge,
    formatMark,
    formatRange,
    monoWidth,
    sansWidth,
    share,
    unitWord,
    type EdgeFormat,
} from "./layout/format";
import { binOverlay, histogramLayout, labelEvery } from "./layout/histogram";
import { centerKnockout, columnCells, sweepPaths } from "./layout/sweep";

type CellHistogramProps = {
    title: string;
    tag?: string;
    // Counts per bin, lowest bin first
    bins: number[];
    binStart: number;
    binSize: number;
    edges?: EdgeFormat;
    // Percentile markers in the same unit as the bin edges, such as p50 at 1400
    percentiles?: { label: string; value: number }[];
    unit: string;
    unitOne?: string;
    summary: string;
    rows?: number;
    cell?: number;
    readouts?: ReadoutItem[];
    state?: ChartState;
    emptyText?: string;
    className?: string;
};

// A distribution as bins of touching cell columns, with dashed percentile markers
export function CellHistogram({
    title,
    tag,
    bins,
    binStart,
    binSize,
    edges = "int",
    percentiles = [],
    unit,
    unitOne,
    summary,
    rows = 18,
    cell = 5,
    readouts,
    state: requested = "ready",
    emptyText = "No data in this range",
    className,
}: CellHistogramProps) {
    const [ref, width] = useFitWidth<HTMLDivElement>(560);
    const state: ChartState = bins.length === 0 && requested !== "loading" ? "empty" : requested;
    const ready = state === "ready" || state === "refetching";
    const shown = ready ? bins : Array.from({ length: bins.length || 20 }, () => 0);
    const total = shown.reduce((sum, v) => sum + v, 0);
    const markers = ready
        ? percentiles.map((p) => {
              const text = `${p.label} ${formatMark(p.value, edges)}`;
              return { text, position: (p.value - binStart) / binSize, textWidth: monoWidth(text, 10) };
          })
        : [];
    const layout = histogramLayout({
        bins: shown,
        plotWidth: Math.max(120, width - AXIS),
        dataRows: Math.max(9, Math.round(rows / 3) * 3),
        preferredCell: cell,
        markers,
    });
    const { field, pitch, span } = layout;
    const binWidth = span * pitch;

    const cursor = useCursor(ready ? shown.length : 0);
    const hover = cursor.index;
    const overlay = hover === null ? null : binOverlay(layout, hover, shown[hover]);
    const totalColumns = field.columnX.length;
    const center = useSweep(totalColumns, state === "loading");
    const sweep = sweepPaths(center, totalColumns, (c) =>
        columnCells(field.columnX[c], field.columnW[c], layout.dataRows + BAND_ROWS, pitch),
    );

    const edgeAt = (i: number) => binStart + i * binSize;
    const range = (i: number) => formatRange(edgeAt(i), edgeAt(i + 1), edges);
    const edgeLabels = Array.from({ length: shown.length + 1 }, (_, i) => formatEdge(edgeAt(i), edges));
    const every = labelEvery(
        edgeLabels.map((text) => monoWidth(text, 10)),
        binWidth,
    );
    const axisBins = Array.from({ length: Math.floor(shown.length / every) + 1 }, (_, k) => k * every);
    const right = hover !== null && hover > shown.length / 2;
    const hoverValue = hover === null ? 0 : shown[hover];

    const table = (
        <ChartTable
            caption={summary}
            height={field.height + 18 + (readouts?.length ? 30 : 0)}
            columns={[{ label: "Range" }, { label: unit.charAt(0).toUpperCase() + unit.slice(1) }, { label: "Share" }]}
            rows={
                ready ? shown.map((v, i) => ({ key: String(i), cells: [range(i), formatInt(v), share(v, total)] })) : []
            }
            emptyText={state === "loading" ? "Loading…" : emptyText}
        />
    );

    return (
        <ChartPane title={title} tag={tag} state={state} readouts={readouts} table={table} className={className}>
            <div ref={ref} className="relative">
                <YAxis
                    ticks={layout.ticks.map((t) => ({ label: formatInt(t.value), y: t.y }))}
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
                        if (!ready || shown.length === 0) return;
                        const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
                        cursor.setIndex(Math.min(shown.length - 1, Math.max(0, Math.floor(x / binWidth))));
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
                    <path d={field.lit.lit ?? ""} fill="var(--signal)" />
                    {overlay ? (
                        <>
                            <path d={overlay.unlit} fill="var(--highlight)" />
                            <path d={overlay.lit} fill="var(--mint)" />
                        </>
                    ) : null}
                    {layout.markers.map((m, i) => (
                        <path key={i} d={m.dashes} fill="var(--ink-muted)" />
                    ))}
                </svg>

                {layout.markers.map((m, i) => {
                    if (!m.label) return null;
                    const [name, ...value] = m.text.split(" ");
                    const before = m.label.x < m.x;
                    return (
                        <span
                            key={i}
                            aria-hidden
                            className="mono absolute text-[10px] leading-[10px] whitespace-nowrap text-ink"
                            style={{
                                left: AXIS + m.label.x,
                                width: m.label.w,
                                top: m.label.h / 2 - 5,
                                textAlign: before ? "right" : "left",
                                paddingLeft: before ? 0 : 3,
                                paddingRight: before ? 3 : 0,
                            }}
                        >
                            <span className="text-ink-muted">{name}</span> {value.join(" ")}
                        </span>
                    );
                })}

                {state === "empty" ? (
                    <FieldMessage
                        text={emptyText}
                        left={AXIS}
                        box={centerKnockout(field.width, field.height, pitch, sansWidth(emptyText, 11), 15)}
                    />
                ) : null}

                <div aria-hidden className="mono relative mt-2 h-[10px] text-[10px] leading-[10px] text-ink-muted">
                    {axisBins.map((i) => {
                        const text = edgeLabels[i];
                        const left = Math.max(
                            0,
                            Math.min(field.width - monoWidth(text, 10), i * binWidth - monoWidth(text, 10) / 2),
                        );
                        return (
                            <span key={i} className="absolute whitespace-nowrap" style={{ left: AXIS + left }}>
                                {text}
                            </span>
                        );
                    })}
                </div>

                {hover !== null ? (
                    <ChartTooltip
                        x={AXIS + hover * binWidth + (right ? -10 : binWidth + 8)}
                        y={Math.max(0, field.height - (hoverValue / layout.unit) * pitch - 52)}
                        alignRight={right}
                        value={formatInt(hoverValue)}
                        unit={unitWord(hoverValue, unit, unitOne)}
                        caption={`${range(hover)} · ${share(hoverValue, total)}`}
                    />
                ) : null}
                <p className="sr-only" aria-live="polite">
                    {hover !== null
                        ? `${formatInt(hoverValue)} ${unitWord(hoverValue, unit, unitOne)}, ${range(hover)}, ${share(hoverValue, total)}`
                        : ""}
                </p>
            </div>
        </ChartPane>
    );
}

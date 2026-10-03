"use client";

import { cn } from "@/lib/utils";
import { formatInt } from "@/lib/format";
import { ChartPane, type ChartState, type ReadoutItem } from "./chart-pane";
import { ChartTooltip } from "./chart-parts";
import { ChartTable } from "./chart-table";
import { FieldMessage, SweepLayer } from "./field-parts";
import { useGridCursor } from "./hooks/use-cursor";
import { useFitWidth } from "./hooks/use-fit-width";
import { useSweep } from "./hooks/use-sweep";
import { sansWidth, unitWord } from "./layout/format";
import {
    DEFAULT_STEPS,
    HEAT_FILLS,
    LABEL_GAP,
    ROW_LABEL,
    heatLayout,
    heatStep,
    ringPath,
    type HeatSteps,
} from "./layout/heatmap";
import { centerKnockout, sweepPaths } from "./layout/sweep";

type CellHeatmapProps = {
    title: string;
    tag?: string;
    // Rows by columns, such as 7 days by 24 hours
    values: number[][];
    rowLabels: string[];
    // One label per column, of which the axis shows only axisColumns
    columnLabels: string[];
    axisColumns?: number[];
    // Readout text per column such as an hour range, defaulting to the column label
    columnCaptions?: string[];
    rowTitle?: string;
    steps?: HeatSteps;
    unit: string;
    unitOne?: string;
    summary: string;
    totals?: boolean;
    readouts?: ReadoutItem[];
    state?: ChartState;
    emptyText?: string;
    className?: string;
};

// Two time axes as a grid of 16px cells in five fixed heat steps, with a totals strip
export function CellHeatmap({
    title,
    tag,
    values,
    rowLabels,
    columnLabels,
    axisColumns,
    columnCaptions,
    rowTitle = "Day",
    steps = DEFAULT_STEPS,
    unit,
    unitOne,
    summary,
    totals = true,
    readouts,
    state: requested = "ready",
    emptyText = "No data in this range",
    className,
}: CellHeatmapProps) {
    const [ref, width] = useFitWidth<HTMLDivElement>(560);
    const state: ChartState = values.length === 0 && requested !== "loading" ? "empty" : requested;
    const ready = state === "ready" || state === "refetching";
    const cols = columnLabels.length;
    const shown = ready ? values : rowLabels.map(() => columnLabels.map(() => 0));
    const layout = heatLayout({ values: shown, cols, available: width - ROW_LABEL - LABEL_GAP, steps, totals });
    const { cell, pitch, gridHeight } = layout;

    const cursor = useGridCursor(ready ? rowLabels.length : 0, cols);
    const hover = cursor.cell;
    const center = useSweep(cols, state === "loading");
    const sweep = sweepPaths(center, cols, (col) => rowLabels.map((_, row) => layout.cellRect(row, col)));

    const marks = axisColumns ?? [...new Set([0, 6, 12, 18, cols - 1])].filter((c) => c < cols);
    const captionOf = (col: number) => columnCaptions?.[col] ?? columnLabels[col];
    const hoverValue = hover ? (shown[hover.row]?.[hover.col] ?? 0) : 0;
    const hoverStep = heatStep(hoverValue, steps);
    const right = hover !== null && hover.col >= cols / 2;

    const table = (
        <ChartTable
            caption={summary}
            height={layout.height + 48}
            columns={[{ label: rowTitle }, ...columnLabels.map((label) => ({ label }))]}
            rows={
                ready
                    ? rowLabels.map((label, r) => ({
                          key: String(r),
                          cells: [label, ...shown[r].map((v) => formatInt(v))],
                      }))
                    : []
            }
            emptyText={state === "loading" ? "Loading…" : emptyText}
        />
    );

    const legend = (
        <span aria-hidden className="mono inline-flex items-center gap-[6px] text-[10px] leading-[10px] text-ink-muted">
            0
            <span className="flex gap-[2px]">
                {HEAT_FILLS.slice(1).map((fill) => (
                    <span key={fill} className="size-[10px]" style={{ background: fill }} />
                ))}
            </span>
            {steps[4]}+
        </span>
    );

    return (
        <ChartPane
            title={title}
            tag={tag}
            state={state}
            readouts={readouts}
            legend={legend}
            table={table}
            className={className}
        >
            <div ref={ref} className={layout.width + ROW_LABEL + LABEL_GAP > width ? "table-scroll pb-2" : undefined}>
                <div className="flex w-max min-w-full">
                    <div aria-hidden className="relative shrink-0" style={{ width: ROW_LABEL, marginRight: LABEL_GAP }}>
                        {rowLabels.map((label, row) => (
                            <span
                                key={label}
                                className={cn(
                                    "absolute right-0 text-[11px] leading-[11px] font-light whitespace-nowrap",
                                    hover?.row === row ? "text-ink" : "text-ink-muted",
                                )}
                                style={{ top: row * pitch + (cell - 11) / 2 }}
                            >
                                {label}
                            </span>
                        ))}
                    </div>

                    <div className="relative" style={{ width: layout.width }}>
                        <svg
                            role="img"
                            aria-label={
                                state === "loading" ? `${title}, loading` : state === "empty" ? emptyText : summary
                            }
                            tabIndex={ready ? 0 : -1}
                            width={layout.width}
                            height={layout.height}
                            shapeRendering="crispEdges"
                            overflow="visible"
                            className="block outline-offset-[6px]"
                            onPointerMove={(event) => {
                                if (!ready) return;
                                const box = event.currentTarget.getBoundingClientRect();
                                const x = event.clientX - box.left;
                                const y = event.clientY - box.top;
                                if (y > gridHeight + 1) return cursor.clear();
                                const row = Math.min(rowLabels.length - 1, Math.max(0, Math.floor(y / pitch)));
                                cursor.setCell({ row, col: Math.min(cols - 1, Math.max(0, Math.floor(x / pitch))) });
                            }}
                            onPointerLeave={cursor.clear}
                            onKeyDown={cursor.onKeyDown}
                            onBlur={cursor.clear}
                        >
                            {layout.paths.map((d, step) =>
                                d ? <path key={step} d={d} fill={HEAT_FILLS[step]} /> : null,
                            )}
                            <SweepLayer paths={sweep} />
                            {layout.totals ? (
                                <>
                                    <path d={layout.totals.field} fill="var(--chart-field)" />
                                    <path d={layout.totals.fill} fill="var(--chart-context)" />
                                </>
                            ) : null}
                            {hover ? (
                                <path d={ringPath(layout.cellRect(hover.row, hover.col))} fill="var(--ink)" />
                            ) : null}
                        </svg>

                        {state === "empty" ? (
                            <FieldMessage
                                text={emptyText}
                                box={centerKnockout(layout.width, gridHeight, pitch, sansWidth(emptyText, 11), 15)}
                            />
                        ) : null}

                        <div
                            aria-hidden
                            className="mono relative mt-2 h-[10px] text-[10px] leading-[10px] text-ink-muted"
                        >
                            {marks.map((col) => (
                                <span
                                    key={col}
                                    className={cn("absolute text-center", hover?.col === col && "text-ink")}
                                    style={{
                                        left: col * pitch - 4,
                                        width: cell + 8,
                                        opacity:
                                            hover && hover.col !== col && Math.abs(hover.col - col) * pitch < 22
                                                ? 0
                                                : 1,
                                    }}
                                >
                                    {columnLabels[col]}
                                </span>
                            ))}
                            {hover && !marks.includes(hover.col) ? (
                                <span
                                    className="absolute text-center text-ink"
                                    style={{ left: hover.col * pitch - 4, width: cell + 8 }}
                                >
                                    {columnLabels[hover.col]}
                                </span>
                            ) : null}
                        </div>

                        {hover ? (
                            <ChartTooltip
                                x={hover.col * pitch + (right ? -10 : cell + 10)}
                                y={Math.max(0, hover.row * pitch - 12)}
                                alignRight={right}
                                value={formatInt(hoverValue)}
                                unit={unitWord(hoverValue, unit, unitOne)}
                                caption={`${rowLabels[hover.row]} ${captionOf(hover.col)}`}
                                keyColor={hoverStep === 0 ? "var(--segment-off)" : HEAT_FILLS[hoverStep]}
                            />
                        ) : null}
                    </div>
                </div>
                <p className="sr-only" aria-live="polite">
                    {hover
                        ? `${formatInt(hoverValue)} ${unitWord(hoverValue, unit, unitOne)}, ${rowLabels[hover.row]} ${captionOf(hover.col)}`
                        : ""}
                </p>
            </div>
        </ChartPane>
    );
}

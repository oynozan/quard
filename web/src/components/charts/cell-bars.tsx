"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartPane, type ChartState, type ReadoutItem } from "./chart-pane";
import { ChartTable } from "./chart-table";
import { SweepLayer } from "./field-parts";
import { useCursor } from "./hooks/use-cursor";
import { useFitWidth } from "./hooks/use-fit-width";
import { useSweep } from "./hooks/use-sweep";
import { barsLayout } from "./layout/bars";
import { formatValue, monoWidth, sansWidth, share, unitWord, type ValueFormat } from "./layout/format";
import { sweepPaths } from "./layout/sweep";

const ROW = 28;

export type BarItem = { label: string; value: number };

type CellBarsProps = {
    title: string;
    tag?: string;
    // Ranked items, top first, kept in the order given
    items: BarItem[];
    unit: string;
    unitOne?: string;
    summary: string;
    // "context" draws quiet grey bars for lists that are not the page's main signal
    tone?: "signal" | "context";
    showShare?: boolean;
    // The share denominator, which defaults to the sum of the items
    total?: number;
    max?: number;
    cell?: number;
    monoLabels?: boolean;
    format?: ValueFormat;
    readouts?: ReadoutItem[];
    state?: ChartState;
    emptyText?: string;
    // Empty tracks drawn while loading or empty
    placeholderRows?: number;
    className?: string;
};

// A ranked list as rows of cells, each value printed at its bar end in text colors
export function CellBars({
    title,
    tag,
    items,
    unit,
    unitOne,
    summary,
    tone = "signal",
    showShare = true,
    total,
    max,
    cell = 8,
    monoLabels = true,
    format = "int",
    readouts,
    state = "ready",
    emptyText = "Nothing to rank yet",
    placeholderRows = 5,
    className,
}: CellBarsProps) {
    const [ref, width] = useFitWidth<HTMLDivElement>(520);
    const ready = (state === "ready" || state === "refetching") && items.length > 0;
    const rows = ready ? items : Array.from({ length: placeholderRows }, () => ({ label: "", value: 0 }));
    const sum = total ?? items.reduce((s, item) => s + item.value, 0);
    const valueText = (item: BarItem) => formatValue(item.value, format);
    const shareText = (item: BarItem) => share(item.value, sum);
    const textWidth = ready
        ? Math.max(...rows.map((r) => monoWidth(showShare ? `${valueText(r)} ${shareText(r)}` : valueText(r), 12)))
        : 0;
    const labelWidth = Math.min(200, Math.max(96, Math.round(width * 0.32)));
    const layout = barsLayout({
        values: rows.map((r) => r.value),
        trackWidth: Math.max(60, width - labelWidth - 12),
        cell,
        textWidth,
        max,
    });

    const cursor = useCursor(ready ? rows.length : 0, "first");
    const hover = cursor.index;
    const center = useSweep(layout.cells, state === "loading");
    const sweep = sweepPaths(center, layout.cells, (col) => [{ x: col * layout.pitch, y: 0, w: cell, h: cell }]);
    const litFill = tone === "context" ? "var(--chart-context)" : "var(--signal)";
    const describe = (item: BarItem) =>
        `${item.label}, ${valueText(item)} ${unitWord(item.value, unit, unitOne)}${showShare ? `, ${shareText(item)}` : ""}`;

    const table = (
        <ChartTable
            caption={summary}
            height={rows.length * ROW + 30 + (readouts?.length ? 30 : 0)}
            columns={[{ label: "Name" }, { label: unit.charAt(0).toUpperCase() + unit.slice(1) }, { label: "Share" }]}
            rows={
                ready
                    ? items.map((item, i) => ({
                          key: String(i),
                          cells: [item.label, valueText(item), shareText(item)],
                      }))
                    : []
            }
            emptyText={state === "loading" ? "Loading…" : emptyText}
        />
    );

    const messageWidth = Math.ceil((sansWidth(emptyText, 11) + 2 * layout.pitch) / layout.pitch) * layout.pitch;

    return (
        <ChartPane title={title} tag={tag} state={state} readouts={readouts} table={table} className={className}>
            <div ref={ref} className="relative">
                <div
                    role="img"
                    aria-label={state === "loading" ? `${title}, loading` : ready ? summary : emptyText}
                    tabIndex={ready ? 0 : -1}
                    className="outline-offset-[6px]"
                    onKeyDown={cursor.onKeyDown}
                    onBlur={cursor.clear}
                    onPointerLeave={cursor.clear}
                >
                    {rows.map((row, i) => {
                        const bar = layout.rows[i];
                        const on = hover === i;
                        return (
                            <div
                                key={i}
                                className="grid items-center gap-3"
                                style={{ height: ROW, gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` }}
                                onPointerEnter={() => ready && cursor.setIndex(i)}
                            >
                                <span
                                    title={row.label}
                                    className={cn(
                                        "truncate text-[12px]",
                                        monoLabels && "mono",
                                        on ? "text-ink" : "text-ink-2",
                                    )}
                                >
                                    {ready ? (
                                        row.label
                                    ) : state === "loading" ? (
                                        <Skeleton width={labelWidth * 0.6} height={10} />
                                    ) : null}
                                </span>
                                <span className="relative block" style={{ height: cell }}>
                                    <svg
                                        width={layout.trackWidth}
                                        height={cell}
                                        shapeRendering="crispEdges"
                                        className="block"
                                    >
                                        <path d={bar.field} fill={on ? "var(--highlight)" : "var(--chart-field)"} />
                                        <SweepLayer paths={sweep} />
                                        <path d={bar.lit} fill={on ? "var(--mint)" : litFill} />
                                    </svg>
                                    {ready ? (
                                        <span
                                            className="mono absolute text-[12px] leading-3 whitespace-nowrap text-ink"
                                            style={{ left: bar.valueX, top: (cell - 12) / 2 }}
                                        >
                                            {valueText(row)}
                                            {showShare ? (
                                                <span className="text-ink-muted"> {shareText(row)}</span>
                                            ) : null}
                                        </span>
                                    ) : null}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {state === "empty" || (!ready && state !== "loading") ? (
                    <span
                        className="absolute flex items-center justify-center bg-page text-[11px] font-light text-ink-muted"
                        style={{
                            left:
                                labelWidth +
                                12 +
                                Math.floor((layout.cells * layout.pitch - messageWidth) / 2 / layout.pitch) *
                                    layout.pitch,
                            top: Math.floor(rows.length / 2) * ROW,
                            width: Math.min(messageWidth, layout.trackWidth),
                            height: ROW,
                        }}
                    >
                        {emptyText}
                    </span>
                ) : null}
                <p className="sr-only" aria-live="polite">
                    {hover !== null && ready ? describe(rows[hover]) : ""}
                </p>
            </div>
        </ChartPane>
    );
}

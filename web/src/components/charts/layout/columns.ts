import {
    allWhole,
    columnField,
    columnOverlay,
    gridlineY,
    niceScale,
    GAP,
    type ColumnField,
    type Rect,
} from "@/lib/charts/cells";
import { DAY } from "@/lib/time";
import { formatClock, formatShortDate } from "@/lib/format";
import { fitCells } from "./fit";

export const AXIS = 40;
export const BAND_ROWS = 3;

export type ColumnsLayout = {
    field: ColumnField;
    cell: number;
    pitch: number;
    groups: number[];
    // Source buckets merged into one group when the width is short
    merge: number;
    // Cell columns per group, and how many of them light
    span: number;
    lit: number;
    unit: number;
    dataRows: number;
    dataWidth: number;
    ticks: { value: number; y: number }[];
    peak: { index: number; value: number; label: Rect } | null;
};

export function mergeValues(values: number[], size: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size).reduce((a, b) => a + b, 0));
    return out;
}

type ColumnsInput = {
    values: number[];
    plotWidth: number;
    dataRows: number;
    // The layout may go one cell size up or down from this to fill the width
    preferredCell: number;
    emphasis: "all" | "last";
    // Width of the peak label text, or 0 for none
    peakTextWidth: number;
};

// Groups of cell columns that fill the plot width, where wide groups keep one unlit column as a gutter
export function columnsLayout(input: ColumnsInput): ColumnsLayout {
    const { values, plotWidth, dataRows, preferredCell, emphasis, peakTextWidth } = input;
    const most = Math.max(1, Math.floor((plotWidth + GAP) / (Math.max(3, preferredCell - 1) + GAP)));
    const merge = Math.max(1, Math.ceil(values.length / most));
    const groups = mergeValues(values, merge);
    const { cell, span } = fitCells(plotWidth, groups.length, preferredCell);
    const pitch = cell + GAP;
    const lit = span >= 3 ? span - 1 : span;
    const highest = Math.max(0, ...groups);
    const { max, step } = niceScale(highest, 3, allWhole(groups));
    const unit = max / dataRows;

    const perColumn = groups.flatMap((value) => Array.from({ length: span }, (_, i) => (i < lit ? value : 0)));
    const dataWidth = perColumn.length * pitch - GAP;
    const peakIndex = groups.indexOf(highest);
    let peak: ColumnsLayout["peak"] = null;
    if (peakTextWidth > 0 && highest > 0) {
        const width = Math.ceil((peakTextWidth + 2 * pitch) / pitch) * pitch;
        const center = peakIndex * span * pitch + (lit * pitch - GAP) / 2;
        const columns = Math.round(Math.max(0, center - width / 2) / pitch);
        const x = Math.min(columns * pitch, Math.max(0, perColumn.length * pitch - width));
        peak = { index: peakIndex, value: highest, label: { x, y: 0, w: width - GAP, h: BAND_ROWS * pitch - GAP } };
    }

    const last = groups.length - 1;
    const field = columnField({
        values: perColumn,
        dataRows,
        bandRows: BAND_ROWS,
        cell,
        unit,
        knockouts: peak ? [peak.label] : [],
        colorOf: (col) => (emphasis === "last" && Math.floor(col / span) === last ? "now" : "lit"),
    });

    const ticks = [1, 2, 3].map((k) => ({ value: k * step, y: gridlineY(field, Math.round((k * step) / unit)) }));
    return { field, cell, pitch, groups, merge, span, lit, unit, dataRows, dataWidth, ticks, peak };
}

// The hovered group redrawn on top with unlit cells in Highlight and lit cells in Soft Mint
export function groupOverlay(layout: ColumnsLayout, group: number) {
    let unlit = "";
    let lit = "";
    for (let i = 0; i < layout.lit; i++) {
        const o = columnOverlay(
            layout.field,
            group * layout.span + i,
            layout.groups[group],
            layout.unit,
            layout.dataRows,
        );
        unlit += o.unlit;
        lit += o.lit;
    }
    return { unlit, lit };
}

export function groupX(layout: ColumnsLayout, group: number): number {
    return group * layout.span * layout.pitch;
}

export function groupAt(layout: ColumnsLayout, x: number): number {
    const index = Math.floor(x / (layout.span * layout.pitch));
    return Math.min(layout.groups.length - 1, Math.max(0, index));
}

// Readable names for a time bucket, as a readout caption and a short axis label
export function bucketNames(startAt: number, bucketMs: number) {
    const daily = bucketMs >= DAY;
    return {
        caption(start: number, end: number): string {
            if (!daily) return `${formatClock(start)}–${formatClock(end)}`;
            if (end - start <= DAY) return formatShortDate(start);
            return `${formatShortDate(start)} – ${formatShortDate(end - DAY)}`;
        },
        axis(start: number): string {
            return daily ? formatShortDate(start) : formatClock(start);
        },
        start(bucket: number): number {
            return startAt + bucket * bucketMs;
        },
    };
}

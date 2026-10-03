import {
    columnField,
    columnOverlay,
    gridlineY,
    niceScale,
    overlaps,
    pathFor,
    GAP,
    type ColumnField,
    type Rect,
} from "@/lib/charts/cells";
import { BAND_ROWS } from "./columns";
import { fitCells } from "./fit";

export type Marker = { text: string; x: number; dashes: string; label: Rect | null };

export type HistogramLayout = {
    field: ColumnField;
    cell: number;
    pitch: number;
    span: number;
    unit: number;
    dataRows: number;
    dataWidth: number;
    ticks: { value: number; y: number }[];
    markers: Marker[];
};

type HistogramInput = {
    bins: number[];
    plotWidth: number;
    dataRows: number;
    // The layout may go one cell size up or down from this to fill the width
    preferredCell: number;
    // Each marker's place in bin units (2.5 is halfway through the third bin) and its label width
    markers: { text: string; position: number; textWidth: number }[];
};

// Bins of touching cell columns, 3 at the reference width, as many as fill the pane
export function histogramLayout({
    bins,
    plotWidth,
    dataRows,
    preferredCell,
    markers,
}: HistogramInput): HistogramLayout {
    const { cell, span } = fitCells(plotWidth, bins.length, preferredCell);
    const pitch = cell + GAP;
    const perColumn = bins.flatMap((value) => Array.from({ length: span }, () => value));
    const total = perColumn.length;
    const { max, step } = niceScale(Math.max(0, ...bins));
    const unit = max / dataRows;
    const bandHeight = BAND_ROWS * pitch - GAP;

    const placed: Marker[] = [];
    for (const marker of markers) {
        const column = Math.min(perColumn.length - 1, Math.max(0, Math.floor(marker.position * span)));
        const wide = Math.ceil((marker.textWidth + pitch) / pitch);
        const after: Rect = { x: column * pitch, y: 0, w: wide * pitch - GAP, h: bandHeight };
        const before: Rect = { x: (column - wide) * pitch, y: 0, w: wide * pitch - GAP, h: bandHeight };
        const fits = (r: Rect) =>
            r.x >= 0 && r.x + r.w <= total * pitch && !placed.some((p) => p.label && overlaps(p.label, r));
        const label = fits(after) ? after : fits(before) ? before : null;
        const dashes: Rect[] = Array.from({ length: dataRows }, (_, row) => ({
            x: Math.max(0, column * pitch - 1.5),
            y: (BAND_ROWS + row) * pitch,
            w: 1,
            h: cell,
        }));
        placed.push({ text: marker.text, x: column * pitch, dashes: pathFor(dashes), label });
    }

    const field = columnField({
        values: perColumn,
        dataRows,
        bandRows: BAND_ROWS,
        cell,
        unit,
        knockouts: placed.flatMap((m) => (m.label ? [m.label] : [])),
    });
    const ticks = [1, 2, 3].map((k) => ({ value: k * step, y: gridlineY(field, Math.round((k * step) / unit)) }));
    return { field, cell, pitch, span, unit, dataRows, dataWidth: total * pitch - GAP, ticks, markers: placed };
}

export function binOverlay(layout: HistogramLayout, bin: number, value: number) {
    let unlit = "";
    let lit = "";
    for (let i = 0; i < layout.span; i++) {
        const o = columnOverlay(layout.field, bin * layout.span + i, value, layout.unit, layout.dataRows);
        unlit += o.unlit;
        lit += o.lit;
    }
    return { unlit, lit };
}

// The fewest bins between x labels that keeps the labels shown at that step apart
export function labelEvery(labelWidths: number[], binWidth: number): number {
    const fits = (k: number) => {
        const widest = Math.max(0, ...labelWidths.filter((_, i) => i % k === 0));
        return k * binWidth >= widest + 12;
    };
    return [1, 2, 4, 5, 10, 20, 25, 50, 100].find(fits) ?? 100;
}

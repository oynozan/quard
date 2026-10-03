import { columnField, gridlineY, niceScale, GAP, type ColumnField, type Rect } from "./cells";

export const HERO_DATA_ROWS = 30;
export const HERO_BAND_ROWS = 4;
const RIGHT_MARGIN = 66;
const MIN_TRAILING = 8;

export type HeroLayout = {
    field: ColumnField;
    bucketSize: number;
    buckets: number[];
    max: number;
    step: number;
    unit: number;
    ticks: { value: number; y: number }[];
    cursor: Rect;
    peak: { index: number; value: number };
};

// Merge 10-minute buckets so the columns fit narrow screens.
function mergeBuckets(values: number[], size: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < values.length; i += size) {
        out.push(values.slice(i, i + size).reduce((sum, v) => sum + v, 0));
    }
    return out;
}

function pickPitch(available: number, columns: number): { pitch: number; size: number } {
    for (const size of [1, 2, 3, 6]) {
        const count = Math.ceil(columns / size);
        const pitch = Math.min(8, Math.floor((available - RIGHT_MARGIN) / (count + 1)));
        if (pitch >= 5) return { pitch, size };
    }
    return { pitch: 5, size: 6 };
}

// Lays out the hero field so it spans the given width exactly.
export function heroLayout(values: number[], width: number): HeroLayout {
    const { pitch, size } = pickPitch(width, values.length);
    const buckets = mergeBuckets(values, size);
    const cell = pitch - GAP;
    const totalColumns = Math.max(buckets.length + MIN_TRAILING, Math.floor((width + GAP) / pitch));
    // Spare pixels widen the last margin columns, so the right edge lands on the content edge.
    const spare = Math.max(0, width + GAP - totalColumns * pitch);
    const columnWidths = Array.from({ length: totalColumns }, (_, i) => cell + (i >= totalColumns - spare ? 1 : 0));
    const highest = Math.max(...buckets);
    const { max, step } = niceScale(highest);
    const unit = max / HERO_DATA_ROWS;

    const field = columnField({
        values: buckets,
        dataRows: HERO_DATA_ROWS,
        bandRows: HERO_BAND_ROWS,
        cell,
        unit,
        columnWidths,
        trailingColumns: totalColumns - buckets.length,
        corners: { radius: 32, tl: true, tr: true, br: true },
    });

    const ticks = [1, 2, 3].map((k) => ({ value: k * step, y: gridlineY(field, Math.round((k * step) / unit)) }));
    const cursorX = field.columnX[buckets.length];
    const cursor = { x: cursorX, y: field.height - (2 * pitch - GAP), w: cell, h: 2 * pitch - GAP };

    return {
        field,
        bucketSize: size,
        buckets,
        max,
        step,
        unit,
        ticks,
        cursor,
        peak: { index: buckets.indexOf(highest), value: highest },
    };
}

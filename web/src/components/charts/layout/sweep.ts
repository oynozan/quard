import { GAP, pathFor, type Rect } from "@/lib/charts/cells";

// Unlit cells brighten as the loading sweep's center column comes within 7, 4 and 2 columns
const BANDS = [
    { within: 2, fill: "var(--segment-off)" },
    { within: 4, fill: "var(--line)" },
    { within: 7, fill: "var(--control)" },
];

export const SWEEP_REACH = 7;

export type SweepPath = { fill: string; d: string };

export function sweepPaths(center: number | null, columns: number, cellsOf: (column: number) => Rect[]): SweepPath[] {
    if (center === null) return [];
    const groups = BANDS.map(() => [] as Rect[]);
    const from = Math.max(0, center - SWEEP_REACH);
    const to = Math.min(columns - 1, center + SWEEP_REACH);
    for (let column = from; column <= to; column++) {
        const band = BANDS.findIndex((b) => Math.abs(column - center) <= b.within);
        groups[band].push(...cellsOf(column));
    }
    return BANDS.map((b, i) => ({ fill: b.fill, d: pathFor(groups[i]) }));
}

// The cells of one column in a uniform field, top row first
export function columnCells(x: number, w: number, rows: number, pitch: number): Rect[] {
    return Array.from({ length: rows }, (_, row) => ({ x, y: row * pitch, w, h: pitch - GAP }));
}

// A centered box of whole cells for a sentence that knocks the field out
export function centerKnockout(
    width: number,
    height: number,
    pitch: number,
    textWidth: number,
    textHeight: number,
): Rect {
    const columns = Math.floor((width + GAP) / pitch);
    const rows = Math.floor((height + GAP) / pitch);
    const wide = Math.min(columns, Math.ceil((textWidth + 2 * pitch) / pitch));
    const tall = Math.min(rows, Math.ceil((textHeight + pitch) / pitch));
    const x = Math.floor((columns - wide) / 2) * pitch;
    const y = Math.floor((rows - tall) / 2) * pitch;
    return { x, y, w: wide * pitch - GAP, h: tall * pitch - GAP };
}

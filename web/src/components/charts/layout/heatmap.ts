import { GAP, pathFor, snap, type Rect } from "@/lib/charts/cells";

export const ROW_LABEL = 24;
export const LABEL_GAP = 8;
export const TOTALS_GAP = 6;

// Fixed lower bounds of Heat 1 to Heat 5, so colors stay put when the range changes
export type HeatSteps = [number, number, number, number, number];
export const DEFAULT_STEPS: HeatSteps = [1, 15, 30, 45, 60];

export const HEAT_FILLS = [
    "var(--chart-field)",
    "var(--heat-1)",
    "var(--heat-2)",
    "var(--heat-3)",
    "var(--heat-4)",
    "var(--heat-5)",
];

// Zero stays unlit and any value above zero lights at least Heat 1
export function heatStep(value: number, steps: HeatSteps): number {
    if (value <= 0) return 0;
    let step = 1;
    for (let i = 1; i < steps.length; i++) if (value >= steps[i]) step = i + 1;
    return step;
}

export type HeatLayout = {
    cell: number;
    pitch: number;
    width: number;
    gridHeight: number;
    height: number;
    // Index 0 is the unlit field, then one path per heat step
    paths: string[];
    totals: { field: string; fill: string } | null;
    cellRect: (row: number, col: number) => Rect;
};

type HeatInput = {
    values: number[][];
    cols: number;
    available: number;
    steps: HeatSteps;
    totals: boolean;
};

// 16px cells when there is room, down to 8px on narrow screens
export function heatLayout({ values, cols, available, steps, totals }: HeatInput): HeatLayout {
    const rows = values.length;
    const cell = Math.min(16, Math.max(8, Math.floor((available + GAP) / Math.max(1, cols)) - GAP));
    const pitch = cell + GAP;
    const width = cols * pitch - GAP;
    const gridHeight = rows * pitch - GAP;
    const cellRect = (row: number, col: number): Rect => ({ x: col * pitch, y: row * pitch, w: cell, h: cell });

    const groups: Rect[][] = HEAT_FILLS.map(() => []);
    values.forEach((line, row) => {
        for (let col = 0; col < cols; col++) groups[heatStep(line[col] ?? 0, steps)].push(cellRect(row, col));
    });

    let strip: HeatLayout["totals"] = null;
    if (totals) {
        const y = gridHeight + TOTALS_GAP;
        const sums = Array.from({ length: cols }, (_, col) => values.reduce((sum, line) => sum + (line[col] ?? 0), 0));
        const busiest = Math.max(0, ...sums);
        const field: Rect[] = [];
        const fill: Rect[] = [];
        sums.forEach((sum, col) => {
            field.push({ x: col * pitch, y, w: cell, h: cell });
            if (sum <= 0 || busiest <= 0) return;
            const h = Math.max(0.5, snap((sum / busiest) * cell));
            fill.push({ x: col * pitch, y: y + cell - h, w: cell, h });
        });
        strip = { field: pathFor(field), fill: pathFor(fill) };
    }

    return {
        cell,
        pitch,
        width,
        gridHeight,
        height: gridHeight + (totals ? TOTALS_GAP + cell : 0),
        paths: groups.map(pathFor),
        totals: strip,
        cellRect,
    };
}

// A 1px ring around a cell, drawn in the gap so it never covers the cell
export function ringPath(r: Rect): string {
    return pathFor([
        { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: 1 },
        { x: r.x - 1, y: r.y + r.h, w: r.w + 2, h: 1 },
        { x: r.x - 1, y: r.y, w: 1, h: r.h },
        { x: r.x + r.w, y: r.y, w: 1, h: r.h },
    ]);
}

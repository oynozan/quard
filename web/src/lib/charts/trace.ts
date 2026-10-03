import { GAP, niceScale, pathFor, type Rect } from "./cells";

export type TraceLayout = {
    width: number;
    height: number;
    pitch: number;
    field: string;
    lit: string;
    over: string;
    limitY: number | null;
    ticks: { value: number; y: number }[];
    columnOf: (index: number) => number;
    max: number;
};

type TraceInput = {
    values: number[];
    columns: number;
    rows: number;
    cell: number;
    limit?: number;
};

// Rasterizes a line onto cells: each column lights every row the line passes through.
export function traceLayout({ values, columns, rows, cell, limit }: TraceInput): TraceLayout {
    const pitch = cell + GAP;
    const width = columns * pitch - GAP;
    const height = rows * pitch - GAP;
    const highest = Math.max(...values, limit ?? 0);
    const { max, step } = niceScale(highest);
    const unit = max / rows;
    const plotWidth = width - cell;
    const pointX = (i: number) => (i / (values.length - 1)) * plotWidth + cell / 2;
    const valueAt = (x: number) => {
        const position = ((x - cell / 2) / plotWidth) * (values.length - 1);
        const i = Math.max(0, Math.min(values.length - 2, Math.floor(position)));
        const t = Math.max(0, Math.min(1, position - i));
        return values[i] + (values[i + 1] - values[i]) * t;
    };

    const limitRow = limit === undefined ? null : Math.round(limit / unit);
    const field: Rect[] = [];
    const lit: Rect[] = [];
    const over: Rect[] = [];

    for (let col = 0; col < columns; col++) {
        const x0 = col * pitch - 1;
        const x1 = col * pitch + cell + 1;
        const samples = [valueAt(x0), valueAt(x1)];
        values.forEach((v, i) => {
            const x = pointX(i);
            if (x >= x0 && x <= x1) samples.push(v);
        });
        const lo = Math.floor(Math.min(...samples) / unit);
        const hi = Math.min(rows - 1, Math.floor(Math.max(...samples) / unit));
        for (let row = 0; row < rows; row++) {
            const rect = { x: col * pitch, y: (rows - 1 - row) * pitch, w: cell, h: cell };
            if (row >= lo && row <= hi) (limitRow !== null && row >= limitRow ? over : lit).push(rect);
            else field.push(rect);
        }
    }

    const rowLineY = (rowsFromBottom: number) => (rows - rowsFromBottom) * pitch - GAP;
    return {
        width,
        height,
        pitch,
        field: pathFor(field),
        lit: pathFor(lit),
        over: pathFor(over),
        limitY: limitRow === null ? null : rowLineY(limitRow),
        ticks: [1, 2, 3].map((k) => ({ value: +(k * step).toFixed(4), y: rowLineY(Math.round((k * step) / unit)) })),
        columnOf: (index: number) => Math.min(columns - 1, Math.floor(pointX(index) / pitch)),
        max,
    };
}

// Largest-remainder split of N cells; any share above zero gets at least one cell.
export function allocateCells(parts: number[], cells: number): number[] {
    const total = parts.reduce((sum, p) => sum + p, 0);
    if (total === 0) return parts.map(() => 0);
    const exact = parts.map((p) => (p / total) * cells);
    const counts = exact.map((e, i) => (parts[i] > 0 ? Math.max(1, Math.floor(e)) : 0));
    let left = cells - counts.reduce((sum, c) => sum + c, 0);
    // Rank by what each part is still owed, so a part raised to one cell sorts last.
    const order = exact
        .map((e, i) => ({ i, rest: e - counts[i] }))
        .filter(({ i }) => parts[i] > 0)
        .sort((a, b) => b.rest - a.rest);
    for (const { i } of order) {
        if (left <= 0) break;
        counts[i] += 1;
        left -= 1;
    }
    while (left < 0) {
        // Take from the most cells; on a tie, from the smallest part.
        const most = Math.max(...counts);
        const pick = counts.reduce(
            (best, c, i) => (c === most && exact[i] < exact[best] ? i : best),
            counts.indexOf(most),
        );
        counts[pick] -= 1;
        left += 1;
    }
    return counts;
}

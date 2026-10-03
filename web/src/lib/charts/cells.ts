// The cell engine behind every chart. See "Charts (signature)" in DESIGN.md.

export type Rect = { x: number; y: number; w: number; h: number };

export const GAP = 2;

// One SVG path for many rectangles, so thousands of cells cost one DOM node.
export function pathFor(rects: Rect[]): string {
    let out = "";
    for (const r of rects) out += `M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}z`;
    return out;
}

// Partial cells snap to whole device pixels (half CSS pixels at 2x).
export function snap(value: number): number {
    return Math.round(value * 2) / 2;
}

// A scale with three clean steps, for example 0 / 50 / 100 / 150.
export function niceScale(highest: number, steps = 3): { max: number; step: number } {
    const top = Math.max(1, highest);
    const magnitude = 10 ** Math.floor(Math.log10(top / steps));
    const step = Math.max(magnitude, Math.ceil(top / steps / magnitude) * magnitude);
    return { max: +(step * steps).toFixed(6), step: +step.toFixed(6) };
}

// Cell widths that span a track exactly: leftover pixels go to evenly spaced cells.
export function stripWidths(track: number, count: number, gap = GAP): number[] {
    const base = Math.max(1, Math.floor((track - gap * (count - 1)) / count));
    const leftover = track - gap * (count - 1) - base * count;
    const widths = Array.from({ length: count }, () => base);
    for (let i = 0; i < leftover && i < count; i++) {
        widths[Math.floor(((i + 0.5) * count) / Math.max(1, leftover))] += 1;
    }
    return widths;
}

export type Corners = { radius: number; tl?: boolean; tr?: boolean; br?: boolean; bl?: boolean };

// True when a point lies inside a rectangle with some rounded corners.
export function insideRounded(x: number, y: number, width: number, height: number, c: Corners): boolean {
    const r = c.radius;
    const check = (cx: number, cy: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    if (c.tl && x < r && y < r) return check(r, r);
    if (c.tr && x > width - r && y < r) return check(width - r, r);
    if (c.br && x > width - r && y > height - r) return check(width - r, height - r);
    if (c.bl && x < r && y > height - r) return check(r, height - r);
    return true;
}

export function overlaps(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export type ColumnFieldInput = {
    values: number[];
    dataRows: number;
    bandRows?: number;
    cell: number;
    unit: number;
    columnWidths?: number[];
    trailingColumns?: number;
    corners?: Corners;
    knockouts?: Rect[];
    colorOf?: (column: number) => string;
};

export type ColumnField = {
    width: number;
    height: number;
    pitch: number;
    field: string;
    lit: Record<string, string>;
    columnX: number[];
    columnW: number[];
    rowTop: (fromBottom: number) => number;
};

// Columns that light whole cells, then the next cell from its bottom by the remainder.
export function columnField(input: ColumnFieldInput): ColumnField {
    const { values, dataRows, cell, unit } = input;
    const bandRows = input.bandRows ?? 0;
    const rows = dataRows + bandRows;
    const pitch = cell + GAP;
    const total = values.length + (input.trailingColumns ?? 0);
    const columnW = Array.from({ length: total }, (_, i) => input.columnWidths?.[i] ?? cell);
    const columnX: number[] = [];
    let cursor = 0;
    for (const w of columnW) {
        columnX.push(cursor);
        cursor += w + GAP;
    }
    const width = cursor - GAP;
    const height = rows * pitch - GAP;
    const rowTop = (fromBottom: number) => (rows - 1 - fromBottom) * pitch;

    const field: Rect[] = [];
    const lit: Record<string, Rect[]> = {};
    const keep = (r: Rect) => {
        if (input.corners && !insideRounded(r.x + r.w / 2, r.y + r.h / 2, width, height, input.corners)) return false;
        return !(input.knockouts ?? []).some((k) => overlaps(r, k));
    };
    const light = (key: string, r: Rect) => (lit[key] ??= []).push(r);

    for (let col = 0; col < total; col++) {
        const x = columnX[col];
        const w = columnW[col];
        const value = col < values.length ? Math.max(0, values[col]) : 0;
        const units = value / unit;
        const full = Math.min(dataRows, Math.floor(units));
        const remainder = units - full;
        const key = input.colorOf?.(col) ?? "lit";

        for (let row = 0; row < rows; row++) {
            const y = row * pitch;
            const fromBottom = rows - 1 - row;
            const rect = { x, y, w, h: cell };
            if (fromBottom < full) {
                light(key, rect);
                continue;
            }
            if (keep(rect)) field.push(rect);
            if (fromBottom === full && fromBottom < dataRows && value > 0 && remainder > 0) {
                const h = Math.max(0.5, snap(remainder * cell));
                light(key, { x, y: y + cell - h, w, h });
            }
        }
    }

    const litPaths: Record<string, string> = {};
    for (const [key, rects] of Object.entries(lit)) litPaths[key] = pathFor(rects);
    return { width, height, pitch, field: pathFor(field), lit: litPaths, columnX, columnW, rowTop };
}

// The hovered column redrawn on top: unlit cells in Highlight, lit cells in Soft Mint.
export function columnOverlay(f: ColumnField, column: number, value: number, unit: number, dataRows: number) {
    const x = f.columnX[column];
    const w = f.columnW[column];
    const rows = Math.round((f.height + GAP) / f.pitch);
    const units = Math.max(0, value) / unit;
    const full = Math.min(dataRows, Math.floor(units));
    const remainder = units - full;
    const unlit: Rect[] = [];
    const lit: Rect[] = [];
    for (let row = 0; row < rows; row++) {
        const fromBottom = rows - 1 - row;
        const rect = { x, y: row * f.pitch, w, h: f.pitch - GAP };
        if (fromBottom < full) lit.push(rect);
        else if (fromBottom < dataRows) unlit.push(rect);
        if (fromBottom === full && fromBottom < dataRows && remainder > 0 && value > 0) {
            const h = Math.max(0.5, snap(remainder * rect.h));
            lit.push({ x, y: rect.y + rect.h - h, w, h });
        }
    }
    return { unlit: pathFor(unlit), lit: pathFor(lit) };
}

// Gridlines live in the upper half of a row gap, at each tick.
export function gridlineY(f: ColumnField, rowsFromBottom: number): number {
    return f.rowTop(rowsFromBottom - 1) - GAP;
}

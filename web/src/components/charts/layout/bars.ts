import { GAP, pathFor, snap, type Rect } from "@/lib/charts/cells";

export type BarRow = { lit: string; field: string; valueX: number };

export type BarsLayout = { cell: number; pitch: number; cells: number; trackWidth: number; rows: BarRow[] };

type BarsInput = {
    values: number[];
    trackWidth: number;
    cell: number;
    // The widest value text, which every bar leaves room for so text never sits on cells
    textWidth: number;
    max?: number;
};

// One row of cells per item lit from the left, with the value text knocking out the cells after the bar
export function barsLayout({ values, trackWidth, cell, textWidth, max }: BarsInput): BarsLayout {
    const pitch = cell + GAP;
    const cells = Math.max(4, Math.floor((trackWidth + GAP) / pitch));
    const textCells = textWidth > 0 ? Math.ceil((textWidth + pitch) / pitch) : 0;
    const usable = Math.max(1, cells - textCells);
    const top = max ?? Math.max(0, ...values);
    const unit = top > 0 ? top / usable : 1;
    const square = (i: number): Rect => ({ x: i * pitch, y: 0, w: cell, h: cell });

    const rows = values.map((value) => {
        const units = Math.max(0, value) / unit;
        const full = Math.min(usable, Math.floor(units));
        const lit: Rect[] = Array.from({ length: full }, (_, i) => square(i));
        const field: Rect[] = [];
        let end = full;
        if (value > 0 && full < usable && units - full > 0) {
            field.push(square(full));
            lit.push({ x: full * pitch, y: 0, w: Math.max(0.5, snap((units - full) * cell)), h: cell });
            end = full + 1;
        }
        for (let i = end + textCells; i < cells; i++) field.push(square(i));
        return { lit: pathFor(lit), field: pathFor(field), valueX: end * pitch + Math.round(pitch / 2) };
    });

    return { cell, pitch, cells, trackWidth: cells * pitch - GAP, rows };
}

import { GAP } from "@/lib/charts/cells";

// The cell size and columns per group that fill a plot best, one size around the preferred cell
export function fitCells(plotWidth: number, groups: number, preferred: number): { cell: number; span: number } {
    const options = [preferred, preferred - 1, preferred + 1].filter((cell) => cell >= 3);
    let best: { cell: number; span: number; left: number } | null = null;
    for (const cell of options) {
        const total = Math.floor((plotWidth + GAP) / (cell + GAP));
        const span = Math.floor(total / Math.max(1, groups));
        if (span < 1) continue;
        const left = (total - span * groups) / total;
        if (left <= 0.15) return { cell, span };
        if (!best || left < best.left) best = { cell, span, left };
    }
    return best ?? { cell: preferred, span: 1 };
}

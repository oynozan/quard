"use client";

import { useState, type KeyboardEvent } from "react";

const BACK = new Set(["ArrowLeft", "ArrowUp"]);
const AHEAD = new Set(["ArrowRight", "ArrowDown"]);

// The hovered or focused mark on one axis, where the first arrow lands on the newest or the top ranked mark
export function useCursor(count: number, start: "first" | "last" = "last") {
    const [index, setIndex] = useState<number | null>(null);
    const current = index !== null && index < count ? index : null;

    function onKeyDown(event: KeyboardEvent) {
        if (count === 0) return;
        if (event.key === "Escape") return setIndex(null);
        const last = count - 1;
        const entry = start === "first" ? 0 : last;
        let next: number | null = null;
        if (BACK.has(event.key)) next = current === null ? entry : current - 1;
        if (AHEAD.has(event.key)) next = current === null ? entry : current + 1;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = last;
        if (next === null) return;
        event.preventDefault();
        setIndex(Math.min(last, Math.max(0, next)));
    }

    return { index: current, setIndex, onKeyDown, clear: () => setIndex(null) };
}

export type GridCell = { row: number; col: number };

// The same for a grid of cells, where Home and End jump within the row
export function useGridCursor(rows: number, cols: number) {
    const [cell, setCell] = useState<GridCell | null>(null);
    const current = cell && cell.row < rows && cell.col < cols ? cell : null;

    function onKeyDown(event: KeyboardEvent) {
        if (rows === 0 || cols === 0) return;
        if (event.key === "Escape") return setCell(null);
        const from = current ?? { row: rows - 1, col: cols - 1 };
        const moves: Record<string, GridCell> = {
            ArrowLeft: { row: from.row, col: from.col - 1 },
            ArrowRight: { row: from.row, col: from.col + 1 },
            ArrowUp: { row: from.row - 1, col: from.col },
            ArrowDown: { row: from.row + 1, col: from.col },
            Home: { row: from.row, col: 0 },
            End: { row: from.row, col: cols - 1 },
        };
        const next = moves[event.key];
        if (!next) return;
        event.preventDefault();
        if (!current) return setCell(from);
        setCell({ row: Math.min(rows - 1, Math.max(0, next.row)), col: Math.min(cols - 1, Math.max(0, next.col)) });
    }

    return { cell: current, setCell, onKeyDown, clear: () => setCell(null) };
}

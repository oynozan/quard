import type { Rect } from "@/lib/charts/cells";

const RECT = /M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)h-?[\d.]+z/g;

// Reads the rectangles back out of a cell path, so tests can check where cells sit
export function rectsOf(d: string): Rect[] {
    return Array.from(d.matchAll(RECT), (m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
}

// The distinct x positions of a path's rectangles, left to right
export function columnsOf(d: string): number[] {
    return [...new Set(rectsOf(d).map((r) => r.x))].sort((a, b) => a - b);
}

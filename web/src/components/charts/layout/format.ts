import { formatCompact, formatCost, formatInt, formatUsd } from "@/lib/format";

// How chart values print, as a string so server pages can pass it to client charts
// "cost" keeps two significant digits below a cent, for small payments
export type ValueFormat = "int" | "compact" | "usd" | "cost" | "percent";

export function formatValue(value: number, format: ValueFormat = "int"): string {
    if (format === "compact") return formatCompact(value);
    if (format === "usd") return formatUsd(value);
    if (format === "cost") return formatCost(value);
    if (format === "percent") return `${+value.toFixed(1)}%`;
    return formatInt(Math.round(value));
}

export function unitWord(value: number, unit: string, unitOne?: string): string {
    return value === 1 && unitOne ? unitOne : unit;
}

export function share(part: number, total: number): string {
    if (total <= 0) return "0%";
    return `${+((part / total) * 100).toFixed(1)}%`;
}

// How bin edges print, where "ms" takes milliseconds and prints seconds
export type EdgeFormat = "ms" | "int" | "usd";

export function formatEdge(value: number, kind: EdgeFormat): string {
    if (kind === "ms") return `${+(value / 1000).toFixed(2)} s`;
    if (kind === "usd") return formatUsd(value);
    return formatInt(value);
}

export function formatRange(from: number, to: number, kind: EdgeFormat): string {
    if (kind === "ms") return `${(from / 1000).toFixed(2)}–${(to / 1000).toFixed(2)} s`;
    if (kind === "usd") return `${formatUsd(from)}–${formatUsd(to)}`;
    return `${formatInt(from)}–${formatInt(to)}`;
}

export function formatMark(value: number, kind: EdgeFormat): string {
    if (kind === "ms") return `${(value / 1000).toFixed(1)} s`;
    if (kind === "usd") return formatUsd(value);
    return formatInt(value);
}

// Ubuntu Mono is half an em wide, so text widths are exact
export function monoWidth(text: string, size: number): number {
    return Math.ceil(text.length * size * 0.5);
}

// Manrope varies by glyph, so this errs a little wide and knockouts never clip
export function sansWidth(text: string, size: number): number {
    return Math.ceil(text.length * size * 0.54);
}

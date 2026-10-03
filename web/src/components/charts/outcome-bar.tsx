import { GAP, pathFor, type Rect } from "@/lib/charts/cells";
import { allocateCells } from "@/lib/charts/trace";
import type { DecisionCounts } from "@/lib/data/types";

const CELL = 5;

type OutcomeBarProps = { counts: DecisionCounts; cells?: number };

// Allowed, asked and blocked calls as one row of cells, in that fixed order.
export function OutcomeBar({ counts, cells = 30 }: OutcomeBarProps) {
    const [allowed, asked, blocked] = allocateCells([counts.allowed, counts.asked, counts.blocked], cells);
    const groups: Record<"allowed" | "asked" | "blocked" | "empty", Rect[]> = {
        allowed: [],
        asked: [],
        blocked: [],
        empty: [],
    };
    let i = 0;
    for (const [key, count] of [
        ["allowed", allowed],
        ["asked", asked],
        ["blocked", blocked],
        ["empty", cells - allowed - asked - blocked],
    ] as const) {
        for (let n = 0; n < count; n++, i++) groups[key].push({ x: i * (CELL + GAP), y: 0, w: CELL, h: CELL });
    }
    const width = cells * (CELL + GAP) - GAP;
    const total = counts.allowed + counts.asked + counts.blocked;
    const label =
        total === 0
            ? "No guard decisions yet"
            : `${counts.allowed} allowed, ${counts.asked} asked, ${counts.blocked} blocked`;

    return (
        <svg role="img" aria-label={label} width={width} height={CELL} shapeRendering="crispEdges" className="block">
            <path d={pathFor(groups.empty)} fill="var(--chart-field)" />
            <path d={pathFor(groups.allowed)} fill="var(--chart-context)" />
            <path d={pathFor(groups.asked)} fill="var(--warning)" />
            <path d={pathFor(groups.blocked)} fill="var(--danger)" />
        </svg>
    );
}

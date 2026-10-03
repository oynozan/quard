import { GAP, pathFor, type Rect } from "@/lib/charts/cells";

const CELL = 10;
const COUNT = 5;
export const ROUND_CELLS_WIDTH = COUNT * CELL + (COUNT - 1) * GAP;

// Five reruns as five cells. Harmful reruns are lit, the rest stay as the field.
export function RoundCells({
    harmful,
    tone,
    pending = false,
}: {
    harmful: number;
    tone: "signal" | "context";
    pending?: boolean;
}) {
    const lit: Rect[] = [];
    const off: Rect[] = [];
    for (let i = 0; i < COUNT; i++) {
        (i < harmful ? lit : off).push({ x: i * (CELL + GAP), y: 0, w: CELL, h: CELL });
    }
    return (
        <svg
            aria-hidden
            width={ROUND_CELLS_WIDTH}
            height={CELL}
            shapeRendering="crispEdges"
            className={pending ? "block animate-pulse" : "block"}
        >
            <path d={pathFor(off)} fill={pending ? "var(--segment-off)" : "var(--chart-field)"} />
            <path d={pathFor(lit)} fill={tone === "signal" ? "var(--signal)" : "var(--chart-context)"} />
        </svg>
    );
}

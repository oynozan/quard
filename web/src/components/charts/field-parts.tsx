import type { Rect } from "@/lib/charts/cells";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChartState } from "./chart-pane";
import type { SweepPath } from "./layout/sweep";

// The y labels column beside a field, right-aligned in 34px and centered on each gridline
export function YAxis({
    ticks,
    height,
    state,
}: {
    ticks: { label: string; y: number }[];
    height: number;
    state: ChartState;
}) {
    const zero = state === "empty" ? "—" : "0";
    return (
        <div
            aria-hidden
            className="mono absolute top-0 left-0 w-[34px] text-right text-[10px] leading-[10px] text-ink-muted"
            style={{ height }}
        >
            {ticks.map((tick) => (
                <span key={tick.y} className="absolute right-0" style={{ top: tick.y - 5 }}>
                    {state === "loading" ? <Skeleton width={16} height={8} /> : state === "empty" ? "—" : tick.label}
                </span>
            ))}
            <span className="absolute right-0" style={{ top: height - 10 }}>
                {state === "loading" ? <Skeleton width={8} height={8} /> : zero}
            </span>
        </div>
    );
}

// A sentence that knocks its cells out of the field, for empty and error states
export function FieldMessage({ text, box, left = 0 }: { text: string; box: Rect; left?: number }) {
    return (
        <span
            className="absolute flex items-center justify-center bg-page px-1 text-center text-[11px] leading-[1.4] font-light text-ink-muted"
            style={{ left: left + box.x, top: box.y, width: box.w, height: box.h }}
        >
            {text}
        </span>
    );
}

// The loading sweep drawn over the unlit field
export function SweepLayer({ paths }: { paths: SweepPath[] }) {
    return <>{paths.map((p) => (p.d ? <path key={p.fill} d={p.d} fill={p.fill} /> : null))}</>;
}

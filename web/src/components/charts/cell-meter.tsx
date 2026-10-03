import { GAP, pathFor, stripWidths, type Rect } from "@/lib/charts/cells";

type CellMeterProps = {
    value: number;
    max: number;
    cells: number;
    width: number;
    label: string;
};

// A ratio against a limit: N square cells lit from the left.
export function CellMeter({ value, max, cells, width, label }: CellMeterProps) {
    const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
    const litCount = ratio > 0 ? Math.max(1, Math.round(ratio * cells)) : 0;
    const widths = stripWidths(width, cells);
    const size = Math.min(...widths);
    const lit: Rect[] = [];
    const off: Rect[] = [];
    let x = 0;
    widths.forEach((w, i) => {
        (i < litCount ? lit : off).push({ x, y: 0, w, h: size });
        x += w + GAP;
    });

    return (
        <svg
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={value}
            width={width}
            height={size}
            shapeRendering="crispEdges"
            className="block"
        >
            <path d={pathFor(off)} fill="var(--segment-off)" />
            <path d={pathFor(lit)} fill="var(--progress-fill, var(--signal))" />
        </svg>
    );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The 6px green live square, hollow when the feed is offline.
export function LiveMark({ live = true }: { live?: boolean }) {
    return (
        <span className="inline-flex items-center gap-[7px] text-[11px] font-light text-ink-muted">
            <span
                aria-hidden
                className={cn("size-[6px]", live ? "bg-signal" : "border border-line-strong bg-transparent")}
            />
            {live ? "Live" : "Offline"}
        </span>
    );
}

// The "Table" / "Chart" switch every chart pane carries.
export function TableToggle({ pressed, onToggle }: { pressed: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            aria-pressed={pressed}
            onClick={onToggle}
            className="text-[12px] leading-none text-ink-link underline decoration-line-hover underline-offset-[3px] hover:text-ink-bright hover:decoration-ink-2"
        >
            {pressed ? "Chart" : "Table"}
        </button>
    );
}

export function HeaderDivider() {
    return <span aria-hidden className="h-3 w-px bg-line" />;
}

// A label and a mono value, as used in readout rows.
export function Readout({ label, value, suffix }: { label: string; value: ReactNode; suffix?: string }) {
    return (
        <span className="inline-flex items-baseline gap-[7px] whitespace-nowrap">
            <span className="text-[11px] font-light text-ink-muted">{label}</span>
            <span className="mono text-[12px] text-ink">{value}</span>
            {suffix ? <span className="text-[11px] font-light text-ink-muted">{suffix}</span> : null}
        </span>
    );
}

type ChartTooltipProps = {
    x: number;
    y: number;
    alignRight: boolean;
    value: string;
    unit: string;
    caption: string;
    keyColor?: string;
};

// The hover readout: value first, the time or bucket under it.
export function ChartTooltip({ x, y, alignRight, value, unit, caption, keyColor = "var(--mint)" }: ChartTooltipProps) {
    return (
        <div
            role="presentation"
            className="pointer-events-none absolute z-10 rounded-sm bg-control-hover px-[9px] pt-[6px] pb-[7px] whitespace-nowrap reveal"
            style={alignRight ? { right: `calc(100% - ${x}px)`, top: y } : { left: x, top: y }}
        >
            <div className="flex items-center gap-[6px]">
                <span aria-hidden className="size-1" style={{ background: keyColor }} />
                <span className="mono text-[13px] leading-[1.35] text-ink">{value}</span>
                <span className="text-[12px] font-light text-ink-muted">{unit}</span>
            </div>
            <div className="mono pl-[10px] text-[11px] text-ink-muted">{caption}</div>
        </div>
    );
}

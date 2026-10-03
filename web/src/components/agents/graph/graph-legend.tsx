import type { ReactNode } from "react";
import { SHARE_STYLES } from "../lib/tones";

function LineSwatch({ color, width, dash }: { color: string; width: number; dash: string | null }) {
    return (
        <svg aria-hidden width={22} height={8} shapeRendering="crispEdges" className="shrink-0">
            <line
                x1={0}
                x2={22}
                y1={4}
                y2={4}
                stroke={color}
                strokeWidth={width}
                strokeDasharray={dash ? `${3 + width * 2} ${2 + width}` : undefined}
            />
        </svg>
    );
}

function NodeSwatch({ className }: { className: string }) {
    return <span aria-hidden className={`size-[10px] shrink-0 ${className}`} />;
}

function Group({ label, children }: { label: string; children: ReactNode }) {
    return (
        <span className="inline-flex flex-wrap items-center gap-x-[14px] gap-y-2">
            <span className="text-ink-faint">{label}</span>
            {children}
        </span>
    );
}

function Item({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-[7px]">
            {swatch}
            {children}
        </span>
    );
}

// Node states and edge colors by untrusted share; thicker lines carry more messages
export function GraphLegend() {
    return (
        <div className="mt-4 flex flex-wrap items-center gap-x-7 gap-y-2 border-t border-line pt-3 text-[11px] font-light text-ink-muted">
            <Group label="Agents">
                <Item swatch={<NodeSwatch className="bg-signal" />}>Running</Item>
                <Item swatch={<NodeSwatch className="bg-chart-context" />}>Idle</Item>
                <Item swatch={<NodeSwatch className="border border-line-strong" />}>Offline</Item>
            </Group>
            <Group label="Untrusted">
                {SHARE_STYLES.map((style) => (
                    <Item key={style.tone} swatch={<LineSwatch color={style.color} width={2} dash={style.dash} />}>
                        <span className="mono">{style.word}</span>
                    </Item>
                ))}
            </Group>
        </div>
    );
}

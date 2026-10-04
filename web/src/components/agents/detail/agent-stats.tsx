import type { ReactNode } from "react";
import { CrossGlyph, WarningGlyph } from "@/components/icons/glyphs";
import type { AgentStats as Stats } from "@/lib/data/agents";
import { formatCost, formatInt, formatShare } from "@/lib/format";
import { cn } from "@/lib/utils";

export const STAT_GRID = "grid grid-cols-4 gap-2 max-[760px]:grid-cols-2";

function Tile({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex min-w-0 flex-col justify-between gap-3 bg-panel p-3">
            <dt className="truncate text-[11px] font-light text-ink-muted">{label}</dt>
            <dd className="min-w-0">{children}</dd>
        </div>
    );
}

function Counter({ children, glyph, tone }: { children: ReactNode; glyph?: ReactNode; tone?: string }) {
    return (
        <span className="inline-flex items-center gap-2">
            {glyph ? <span className={cn("flex", tone)}>{glyph}</span> : null}
            <span className="mono block text-[26px] leading-none text-ink max-[760px]:text-[22px]">{children}</span>
        </span>
    );
}

// The last 24 hours: what needed a person first, then cost
export function AgentStats({ stats }: { stats: Stats }) {
    return (
        <section aria-label="Last 24 hours">
            <p className="mono mb-2 text-[11px] text-ink-faint">LAST 24H</p>
            <dl className={STAT_GRID}>
                <Tile label="Asked">
                    <Counter glyph={stats.asked24h ? <WarningGlyph size={14} /> : undefined} tone="text-warning">
                        {formatInt(stats.asked24h)}
                    </Counter>
                </Tile>
                <Tile label="Blocked">
                    <Counter glyph={stats.blocked24h ? <CrossGlyph size={14} /> : undefined} tone="text-danger">
                        {formatInt(stats.blocked24h)}
                    </Counter>
                </Tile>
                <Tile label="Calls after untrusted">
                    <Counter>{stats.influencedShare === null ? "—" : formatShare(stats.influencedShare)}</Counter>
                </Tile>
                <Tile label="Est. cost">
                    <Counter>{stats.costKnown ? formatCost(stats.costUsd24h) : "—"}</Counter>
                </Tile>
            </dl>
        </section>
    );
}

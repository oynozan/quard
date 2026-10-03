import type { ReactNode } from "react";
import { CrossGlyph, WarningGlyph } from "@/components/icons/glyphs";
import type { RunRow } from "@/lib/data/runs/types";
import { formatInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { costText } from "./lib/cost";

// Observe-mode results that would have blocked or asked if the rule were on.
export type Observed = { wouldBlock: number; wouldAsk: number };

function Tile({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    return (
        <div className={cn("flex min-w-0 flex-col justify-between gap-3 bg-panel p-3", className)}>
            <dt className="text-[11px] font-light text-ink-muted">{label}</dt>
            <dd className="min-w-0">{children}</dd>
        </div>
    );
}

function Counter({ children }: { children: ReactNode }) {
    return <span className="mono block text-[26px] leading-none text-ink max-[760px]:text-[22px]">{children}</span>;
}

function Split({ glyph, value, word, tone }: { glyph?: ReactNode; value: number; word: string; tone?: string }) {
    return (
        <span className="inline-flex items-baseline gap-[6px]">
            {glyph ? <span className={cn("self-center", tone)}>{glyph}</span> : null}
            <span className="mono text-[20px] leading-none text-ink">{formatInt(value)}</span>
            <span className="text-[11px] font-light text-ink-muted">{word}</span>
        </span>
    );
}

// Four tiles: agents, steps, cost and the guard decisions, problems first.
export function RunSummary({ run, observed }: { run: RunRow; observed: Observed }) {
    const { allowed, asked, blocked } = run.decisions;
    const { wouldBlock, wouldAsk } = observed;
    return (
        <dl
            aria-label="Run summary"
            className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,2fr)] gap-[10px] max-[980px]:grid-cols-3 max-[560px]:grid-cols-2"
        >
            <Tile label="Agents">
                <Counter>{formatInt(run.agents.length)}</Counter>
            </Tile>
            <Tile label="Steps">
                <Counter>{formatInt(run.steps)}</Counter>
            </Tile>
            <Tile label="Estimated cost" className="max-[560px]:col-span-2">
                <Counter>{costText(run.costUsd, run.costKnown, (usd) => `$${usd.toFixed(4)}`)}</Counter>
            </Tile>
            <Tile label="Guard decisions" className="max-[980px]:col-span-3 max-[560px]:col-span-2">
                <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
                    {blocked ? (
                        <Split value={blocked} word="blocked" glyph={<CrossGlyph size={13} />} tone="text-danger" />
                    ) : null}
                    {asked ? (
                        <Split value={asked} word="asked" glyph={<WarningGlyph size={13} />} tone="text-warning" />
                    ) : null}
                    {wouldBlock ? <Split value={wouldBlock} word="would block" /> : null}
                    {wouldAsk ? <Split value={wouldAsk} word="would ask" /> : null}
                    <Split value={Math.max(0, allowed - wouldBlock - wouldAsk)} word="allowed" />
                </div>
            </Tile>
        </dl>
    );
}

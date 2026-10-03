import { CellMeter } from "@/components/charts/cell-meter";
import { Pane } from "@/components/kit/pane";
import type { RunLimitUse } from "@/lib/data/runs/types";
import { cn } from "@/lib/utils";

// The steps limit counts model calls, so it is named for them.
const NAME = { depth: "Delegation depth", "fan-out": "Fan-out", loops: "Loops", steps: "Model calls", cost: "Cost" };

function amount(limit: RunLimitUse, value: number): string {
    return limit.name === "cost" ? `$${value.toFixed(2)}` : String(value);
}

function modeWord(limit: RunLimitUse): string {
    const observe = limit.mode === "observe";
    if (limit.over) return observe ? "Would stop" : "Stopped";
    return observe ? "Observe" : "Enforced";
}

// Each run limit as a meter against its default, with the mode it runs in and passed limits first
export function RunLimits({ limits }: { limits: RunLimitUse[] }) {
    if (limits.length === 0) return null;
    const sorted = [...limits].sort((a, b) => Number(b.over) - Number(a.over));
    return (
        <Pane title="Run limits">
            <ul className="px-3 py-1">
                {sorted.map((limit) => (
                    <li key={limit.name} className="border-b border-line py-[10px] last:border-b-0">
                        <div className="mb-[6px] flex items-baseline justify-between gap-3 text-[12px]">
                            <span className="font-light text-ink-2">{NAME[limit.name]}</span>
                            <span className="mono text-ink">
                                {amount(limit, limit.used)}
                                <span className="text-ink-muted"> / {amount(limit, limit.limit)}</span>
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <CellMeter
                                value={limit.used}
                                max={limit.limit}
                                cells={18}
                                width={130}
                                label={`${NAME[limit.name]}: ${amount(limit, limit.used)} of ${amount(limit, limit.limit)} ${limit.unit}`}
                            />
                            <span
                                className={cn(
                                    "text-[11px] font-light whitespace-nowrap",
                                    limit.over ? "text-ink-alert" : "text-ink-muted",
                                )}
                            >
                                {modeWord(limit)}
                            </span>
                        </div>
                    </li>
                ))}
            </ul>
        </Pane>
    );
}

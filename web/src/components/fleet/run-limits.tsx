import { FitMeter } from "@/components/charts/fit";
import { SectionHeading } from "@/components/kit/headings";
import type { RunLimitCount } from "@/lib/data/fleet";
import { formatUsd, padCount } from "@/lib/format";
import { hasLimitHits, limitCount } from "./lib/sections";
import { EmptySection, LoadingSection } from "./section-states";

const TITLE = "Run limits";

const NAMES: Record<RunLimitCount["name"], string> = {
    depth: "Depth",
    "fan-out": "Fan-out",
    loops: "Loops",
    steps: "Steps",
    cost: "Cost",
};

function limitText(limit: RunLimitCount): string {
    return limit.unit === "USD" ? formatUsd(limit.limit) : `${limit.limit} ${limit.unit}`;
}

// Runs that went over each run limit, as one tile per limit
export function RunLimits({ limits }: { limits: RunLimitCount[] | null }) {
    if (!limits) return <LoadingSection title={TITLE} />;
    if (!hasLimitHits(limits)) {
        return <EmptySection title={TITLE}>No runs over a limit in the last 30 days</EmptySection>;
    }

    const counts = limits.map(limitCount);
    const max = Math.max(...counts);

    return (
        <section aria-label={TITLE}>
            <SectionHeading title={TITLE} />
            <div className="grid grid-cols-5 gap-2 max-[1180px]:grid-cols-3 max-[760px]:grid-cols-2">
                {limits.map((limit, index) => (
                    <LimitTile key={limit.name} limit={limit} count={counts[index]} max={max} />
                ))}
            </div>
        </section>
    );
}

function LimitTile({ limit, count, max }: { limit: RunLimitCount; count: number; max: number }) {
    const title = NAMES[limit.name];
    const verb = limit.mode === "observe" ? "would stop" : "stopped";

    return (
        <section
            aria-label={`${title} limit`}
            className="flex h-[136px] min-w-0 flex-col bg-panel last:max-[1180px]:col-span-2"
        >
            <h3 className="px-3 pt-3 text-[12px] font-light text-ink-link max-[760px]:text-[11px]">{title}</h3>
            <div className="flex flex-1 items-center gap-2 px-3">
                <span className="mono text-[32px] leading-none text-ink">{padCount(count)}</span>
                <span className="text-[11px] font-light text-ink-muted">{verb}</span>
            </div>
            <div className="flex h-[54px] flex-col justify-end px-3 pb-3">
                <div className="mb-[9px] text-[11px] leading-[1.55] text-ink-muted max-[760px]:text-[10px]">
                    <span className="mono block truncate" title={`Limit: ${limitText(limit)}`}>
                        {limitText(limit)}
                    </span>
                </div>
                <FitMeter
                    value={count}
                    max={max}
                    cells={24}
                    label={`${count} runs ${verb} at the ${title.toLowerCase()} limit in the last 30 days. The most for any limit is ${max}.`}
                />
            </div>
        </section>
    );
}

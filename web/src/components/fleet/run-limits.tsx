import { FitMeter } from "@/components/charts/fit";
import { SectionHeading } from "@/components/kit/headings";
import { Skeleton } from "@/components/ui/skeleton";
import type { RunLimitCount } from "@/lib/data/fleet";
import { formatUsd, padCount } from "@/lib/format";

const NAMES: Record<RunLimitCount["name"], string> = {
    depth: "Depth",
    "fan-out": "Fan-out",
    loops: "Loops",
    steps: "Steps",
    cost: "Cost",
};

const PLACEHOLDERS = Object.keys(NAMES) as RunLimitCount["name"][];

function limitText(limit: RunLimitCount): string {
    return limit.unit === "USD" ? formatUsd(limit.limit) : `${limit.limit} ${limit.unit}`;
}

// Runs that went over each run limit. Observe-mode limits only count what they would stop.
export function RunLimits({ limits }: { limits: RunLimitCount[] | null }) {
    const counts = limits?.map((limit) => (limit.mode === "observe" ? limit.wouldStop : limit.stopped)) ?? [];
    const max = Math.max(1, ...counts);

    return (
        <section aria-label="Run limits" aria-busy={limits === null || undefined}>
            <SectionHeading title="Run limits" />
            <div className="grid grid-cols-5 gap-2 max-[1180px]:grid-cols-3 max-[760px]:grid-cols-2">
                {limits
                    ? limits.map((limit, index) => (
                          <LimitTile key={limit.name} limit={limit} count={counts[index]} max={max} />
                      ))
                    : PLACEHOLDERS.map((name) => <LimitTile key={name} name={name} />)}
            </div>
        </section>
    );
}

type LimitTileProps = { limit?: RunLimitCount; name?: RunLimitCount["name"]; count?: number; max?: number };

function LimitTile({ limit, name, count = 0, max = 1 }: LimitTileProps) {
    const title = NAMES[limit?.name ?? name ?? "depth"];
    const observe = limit?.mode !== "block";
    const verb = observe ? "would stop" : "stopped";

    return (
        <section
            aria-label={`${title} limit`}
            className="flex h-[136px] min-w-0 flex-col bg-panel last:max-[1180px]:col-span-2"
        >
            <h3 className="px-3 pt-3 text-[12px] font-light text-ink-link max-[760px]:text-[11px]">{title}</h3>
            <div className="flex flex-1 items-center gap-2 px-3">
                {limit ? (
                    <>
                        <span className="mono text-[32px] leading-none text-ink">{padCount(count)}</span>
                        <span className="text-[11px] font-light text-ink-muted">{verb}</span>
                    </>
                ) : (
                    <Skeleton width={52} height={30} />
                )}
            </div>
            <div className="flex h-[54px] flex-col justify-end px-3 pb-3">
                <div className="mb-[9px] text-[11px] leading-[1.55] text-ink-muted max-[760px]:text-[10px]">
                    {limit ? (
                        <span className="mono block truncate" title={`Limit: ${limitText(limit)}`}>
                            {limitText(limit)}
                        </span>
                    ) : (
                        <Skeleton width={40} height={10} />
                    )}
                </div>
                <FitMeter
                    value={limit ? count : 0}
                    max={max}
                    cells={24}
                    label={
                        limit
                            ? `${count} runs ${verb} at the ${title.toLowerCase()} limit in the last 30 days. The most for any limit is ${max}.`
                            : `${title} limit loading`
                    }
                />
            </div>
        </section>
    );
}

import type { ReactNode } from "react";
import { FitMeter } from "@/components/charts/fit";
import { unitWord } from "@/components/charts/layout/format";
import { SectionHeading } from "@/components/kit/headings";
import { Skeleton } from "@/components/ui/skeleton";
import type { RunLimitCount } from "@/lib/data/fleet";
import { padCount } from "@/lib/format";
import { limitCount } from "./lib/sections";

type LimitName = RunLimitCount["name"];

const NAMES: Record<LimitName, string> = {
    depth: "Depth",
    "fan-out": "Fan-out",
    loops: "Loops",
    steps: "Steps",
    cost: "Cost",
};

const LIMITS = Object.keys(NAMES) as LimitName[];

// Runs that went over each run limit, as one tile per limit
export function RunLimits({ limits }: { limits: RunLimitCount[] | null }) {
    const counts = limits?.map(limitCount) ?? [];
    // At least 1, so a meter has a scale when no run went over any limit
    const max = Math.max(1, ...counts);

    return (
        <section aria-label="Run limits" aria-busy={limits === null || undefined}>
            <SectionHeading title="Run limits" />
            <div className="grid grid-cols-5 gap-2 max-[1180px]:grid-cols-3 max-[760px]:grid-cols-2">
                {limits?.length
                    ? limits.map((limit, index) => (
                          <LimitTile key={limit.name} limit={limit} count={counts[index]} max={max} />
                      ))
                    : LIMITS.map((name) => <PlaceholderTile key={name} name={name} loading={!limits} />)}
            </div>
        </section>
    );
}

function LimitTile({ limit, count, max }: { limit: RunLimitCount; count: number; max: number }) {
    const title = NAMES[limit.name];
    const verb = limit.mode === "observe" ? "would stop" : "stopped";

    return (
        <TileFrame
            title={title}
            counter={
                <>
                    <span className="mono text-[32px] leading-none text-ink">{padCount(count)}</span>
                    <span className="text-[11px] font-light text-ink-muted">{verb}</span>
                </>
            }
            limit={
                <span className="mono block truncate" title={`Rule: ${limit.rule}`}>
                    {limit.rule}
                </span>
            }
            meter={
                <FitMeter
                    value={count}
                    max={max}
                    cells={24}
                    label={`${count} ${unitWord(count, "runs", "run")} ${verb} at the ${title.toLowerCase()} limit in the last 30 days. The most for any limit is ${max}.`}
                />
            }
        />
    );
}

// Skeletons while the counts load, then em dashes while no limit reports any
function PlaceholderTile({ name, loading }: { name: LimitName; loading: boolean }) {
    const title = NAMES[name];

    return (
        <TileFrame
            title={title}
            counter={
                loading ? (
                    <Skeleton width={52} height={30} />
                ) : (
                    <span className="mono text-[32px] leading-none text-ink">—</span>
                )
            }
            limit={loading ? <Skeleton width={40} height={10} /> : <span className="mono block">—</span>}
            meter={
                <FitMeter
                    value={0}
                    max={1}
                    cells={24}
                    label={
                        loading
                            ? `${title} limit loading`
                            : `No runs counted at the ${title.toLowerCase()} limit in the last 30 days`
                    }
                />
            }
        />
    );
}

type TileFrameProps = { title: string; counter: ReactNode; limit: ReactNode; meter: ReactNode };

// A 136px tile with the name, the counter, and the rule over its meter
function TileFrame({ title, counter, limit, meter }: TileFrameProps) {
    return (
        <section
            aria-label={`${title} limit`}
            className="flex h-[136px] min-w-0 flex-col bg-panel last:max-[1180px]:col-span-2"
        >
            <h3 className="px-3 pt-3 text-[12px] font-light text-ink-link max-[760px]:text-[11px]">{title}</h3>
            <div className="flex flex-1 items-center gap-2 px-3">{counter}</div>
            <div className="flex h-[54px] flex-col justify-end px-3 pb-3">
                <div className="mb-[9px] text-[11px] leading-[1.55] text-ink-muted max-[760px]:text-[10px]">
                    {limit}
                </div>
                {meter}
            </div>
        </section>
    );
}

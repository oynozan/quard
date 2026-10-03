"use client";

import { useState } from "react";
import { CellColumns } from "@/components/charts/cell-columns";
import { CellHeatmap } from "@/components/charts/cell-heatmap";
import { SectionHeading } from "@/components/kit/headings";
import { Toolbar } from "@/components/kit/table/toolbar";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import type { BlocksByGuard, BlocksHeatmap } from "@/lib/data/fleet";
import { DAY } from "@/lib/time";
import { formatInt } from "@/lib/format";
import {
    BLOCK_HEAT_STEPS,
    DAYS,
    GUARD_NAMES,
    HOUR_AXIS,
    HOUR_CAPTIONS,
    HOURS,
    dailySummary,
    heatSummary,
    peakIndex,
    sum,
} from "./lib/charts";
import { hasBlocks } from "./lib/sections";
import { EmptySection } from "./section-states";
import { TILE, TileGrid } from "./tile-grid";

const TITLE = "What guards block";
const GRID = "grid-cols-2 max-[1180px]:grid-cols-1";

type BlocksPanesProps = { byGuard: BlocksByGuard | null; heatmap: BlocksHeatmap | null };

// What the guards block, per day for one guard type and by weekday and hour for all of them
export function BlocksPanes({ byGuard, heatmap }: BlocksPanesProps) {
    const [guard, setGuard] = useState("all");
    if (!byGuard || !heatmap) return <BlocksLoading />;
    if (!hasBlocks(byGuard)) return <EmptySection title={TITLE}>No blocks in the last 30 days</EmptySection>;

    // Only guards that blocked something are offered, so no count reads 0
    const guards = byGuard.series.filter((row) => row.total > 0);
    const series = guards.find((row) => row.guard === guard);
    const values = series?.values ?? byGuard.totals;
    const name = series ? `${GUARD_NAMES[series.guard]} blocks` : "Blocks";
    const options = [
        { value: "all", label: "All guards", count: sum(byGuard.totals) },
        ...guards.map((row) => ({ value: row.guard, label: GUARD_NAMES[row.guard], count: row.total })),
    ];

    return (
        <section aria-label={TITLE}>
            <SectionHeading title={TITLE} />
            <Toolbar>
                <Segmented
                    options={options}
                    value={series ? guard : "all"}
                    onValueChange={setGuard}
                    aria-label="Guard type"
                />
            </Toolbar>
            <TileGrid className={GRID}>
                <CellColumns
                    className={TILE}
                    title={`${name} per day`}
                    values={values}
                    startAt={byGuard.startAt}
                    bucketMs={DAY}
                    unit="blocks"
                    unitOne="block"
                    rows={24}
                    summary={dailySummary(name, values, byGuard.startAt)}
                    readouts={[{ label: "Today", value: formatInt(values[values.length - 1]) }]}
                />
                <CellHeatmap
                    className={TILE}
                    title="Blocks by hour, all guards"
                    tag="UTC"
                    values={heatmap.values}
                    rowLabels={DAYS}
                    columnLabels={HOURS}
                    axisColumns={HOUR_AXIS}
                    columnCaptions={HOUR_CAPTIONS}
                    steps={BLOCK_HEAT_STEPS}
                    unit="blocks"
                    unitOne="block"
                    summary={heatSummary(heatmap)}
                    readouts={[{ label: "Busiest hour", value: HOUR_CAPTIONS[peakIndex(heatmap.hourTotals)] }]}
                />
            </TileGrid>
        </section>
    );
}

// The section's toolbar and both charts while the blocks load
function BlocksLoading() {
    return (
        <section aria-label={TITLE}>
            <SectionHeading title={TITLE} />
            <Toolbar>
                <span className="flex h-8 items-center gap-2" aria-hidden>
                    <Skeleton width={240} height={12} />
                </span>
            </Toolbar>
            <TileGrid className={GRID}>
                <CellColumns
                    className={TILE}
                    title="Blocks per day"
                    values={[]}
                    startAt={0}
                    bucketMs={DAY}
                    unit="blocks"
                    unitOne="block"
                    rows={24}
                    state="loading"
                    summary="Blocks per day are loading."
                    readouts={[{ label: "Today", value: "" }]}
                />
                <CellHeatmap
                    className={TILE}
                    title="Blocks by hour, all guards"
                    tag="UTC"
                    values={[]}
                    rowLabels={DAYS}
                    columnLabels={HOURS}
                    axisColumns={HOUR_AXIS}
                    columnCaptions={HOUR_CAPTIONS}
                    steps={BLOCK_HEAT_STEPS}
                    unit="blocks"
                    unitOne="block"
                    state="loading"
                    summary="Blocks by weekday and hour are loading."
                    readouts={[{ label: "Busiest hour", value: "" }]}
                />
            </TileGrid>
        </section>
    );
}

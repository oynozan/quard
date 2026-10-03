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
    chartState,
    dailySummary,
    heatSummary,
    peakIndex,
    sum,
} from "./lib/charts";
import { TILE, TileGrid } from "./tile-grid";

const EMPTY = "No blocks in the last 30 days";

type BlocksPanesProps = { byGuard: BlocksByGuard | null; heatmap: BlocksHeatmap | null };

// What the guards block, per day for one guard type and by weekday and hour for all of them
export function BlocksPanes({ byGuard, heatmap }: BlocksPanesProps) {
    const [guard, setGuard] = useState("all");
    // Only guards that blocked something are offered
    const guards = byGuard?.series.filter((row) => row.total > 0) ?? [];
    const series = guards.find((row) => row.guard === guard);
    const values = series?.values ?? byGuard?.totals ?? [];
    const name = series ? `${GUARD_NAMES[series.guard]} blocks` : "Blocks";
    const startAt = byGuard?.startAt ?? 0;
    const options = [
        { value: "all", label: "All guards", count: sum(byGuard?.totals ?? []) },
        ...guards.map((row) => ({ value: row.guard, label: GUARD_NAMES[row.guard], count: row.total })),
    ];

    return (
        <section aria-label="What guards block">
            <SectionHeading title="What guards block" />
            <Toolbar>
                {byGuard ? (
                    <Segmented
                        options={options}
                        value={series ? guard : "all"}
                        onValueChange={setGuard}
                        aria-label="Guard type"
                    />
                ) : (
                    <span className="flex h-8 items-center gap-2" aria-hidden>
                        <Skeleton width={240} height={12} />
                    </span>
                )}
            </Toolbar>
            <TileGrid className="grid-cols-2 max-[1180px]:grid-cols-1">
                <CellColumns
                    className={TILE}
                    title={`${name} per day`}
                    values={values}
                    startAt={startAt}
                    bucketMs={DAY}
                    unit="blocks"
                    unitOne="block"
                    rows={24}
                    state={chartState(byGuard ? values : null)}
                    summary={byGuard ? dailySummary(name, values, startAt) : "Blocks per day are loading."}
                    readouts={[{ label: "Today", value: formatInt(values.at(-1) ?? 0) }]}
                    emptyText={EMPTY}
                />
                <CellHeatmap
                    className={TILE}
                    title="Blocks by hour, all guards"
                    tag="UTC"
                    values={heatmap?.values ?? []}
                    rowLabels={DAYS}
                    columnLabels={HOURS}
                    axisColumns={HOUR_AXIS}
                    columnCaptions={HOUR_CAPTIONS}
                    steps={BLOCK_HEAT_STEPS}
                    unit="blocks"
                    unitOne="block"
                    state={chartState(heatmap?.hourTotals ?? null)}
                    summary={heatmap ? heatSummary(heatmap) : "Blocks by weekday and hour are loading."}
                    readouts={[{ label: "Busiest hour", value: HOUR_CAPTIONS[peakIndex(heatmap?.hourTotals ?? [])] }]}
                    emptyText={EMPTY}
                />
            </TileGrid>
        </section>
    );
}

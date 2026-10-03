"use client";

import { useState } from "react";
import { CellColumns } from "@/components/charts/cell-columns";
import { CellHeatmap } from "@/components/charts/cell-heatmap";
import { SectionHeading } from "@/components/kit/headings";
import { Toolbar } from "@/components/kit/table/toolbar";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import type { BlocksByGuard, BlocksHeatmap } from "@/lib/data/fleet";
import { DAY } from "@/lib/data/rng";
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
import { TILE, TileGrid } from "./tile-grid";

type BlocksPanesProps = { byGuard: BlocksByGuard | null; heatmap: BlocksHeatmap | null };

// What the guards block: per day for one guard type, and by weekday and hour for all of them
export function BlocksPanes({ byGuard, heatmap }: BlocksPanesProps) {
    const [guard, setGuard] = useState("all");
    const series = byGuard?.series.find((row) => row.guard === guard);
    const values = byGuard ? (series?.values ?? byGuard.totals) : [];
    const name = series ? `${GUARD_NAMES[series.guard]} blocks` : "Blocks";
    const startAt = byGuard?.startAt ?? 0;
    const busiest = heatmap ? peakIndex(heatmap.hourTotals) : 0;

    const options = byGuard
        ? [
              { value: "all", label: "All guards", count: sum(byGuard.totals) },
              ...byGuard.series.map((row) => ({ value: row.guard, label: GUARD_NAMES[row.guard], count: row.total })),
          ]
        : [];

    return (
        <section aria-label="What guards block">
            <SectionHeading title="What guards block" />
            <Toolbar>
                {byGuard ? (
                    <Segmented options={options} value={guard} onValueChange={setGuard} aria-label="Guard type" />
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
                    state={byGuard ? "ready" : "loading"}
                    summary={dailySummary(name, values, startAt)}
                    readouts={[{ label: "Today", value: byGuard ? formatInt(values[values.length - 1] ?? 0) : "" }]}
                    emptyText="No blocks in the last 30 days"
                />
                <CellHeatmap
                    className={TILE}
                    title="Blocks by hour, all guards"
                    tag="UTC"
                    values={heatmap?.values ?? DAYS.map(() => HOURS.map(() => 0))}
                    rowLabels={heatmap?.days ?? DAYS}
                    columnLabels={HOURS}
                    axisColumns={HOUR_AXIS}
                    columnCaptions={HOUR_CAPTIONS}
                    steps={BLOCK_HEAT_STEPS}
                    unit="blocks"
                    unitOne="block"
                    state={heatmap ? "ready" : "loading"}
                    summary={heatmap ? heatSummary(heatmap) : "Blocks by weekday and hour are loading."}
                    readouts={[{ label: "Busiest hour", value: heatmap ? HOUR_CAPTIONS[busiest] : "" }]}
                    emptyText="No blocks in the last 30 days"
                />
            </TileGrid>
        </section>
    );
}

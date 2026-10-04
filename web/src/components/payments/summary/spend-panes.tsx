import { CellBars } from "@/components/charts/cell-bars";
import { CellColumns } from "@/components/charts/cell-columns";
import type { ReadoutItem } from "@/components/charts/chart-pane";
import { SectionHeading } from "@/components/kit/headings";
import { chartState } from "@/components/fleet/lib/charts";
import { TILE, TileGrid } from "@/components/fleet/tile-grid";
import type { SpendData } from "@/lib/data/payments/types";
import { formatCost, formatInt } from "@/lib/format";
import { DAY } from "@/lib/time";
import { barsSummary, daySummary, spendBars } from "../lib/summary";

const EMPTY = "No x402 spend in the last 30 days";

function readoutsOf(spend: SpendData): ReadoutItem[] {
    const total = { label: "Total", value: formatCost(spend.totalUsd) };
    if (spend.unknown === 0) return [total];
    return [total, { label: "Value unknown", value: formatInt(spend.unknown), suffix: "payments" }];
}

// Settled x402 spend per day, and by agent, host and payee
export function SpendPanes({ spend }: { spend: SpendData | null }) {
    const values = spend?.byDay ?? [];
    const groups = [
        { title: "By agent", items: spendBars(spend?.byAgent ?? []), what: "x402 spend by agent" },
        { title: "By host", items: spendBars(spend?.byHost ?? []), what: "x402 spend by host" },
        { title: "By payee", items: spendBars(spend?.byPayee ?? [], true), what: "x402 spend by payee" },
    ];
    return (
        <section aria-label="x402 spend">
            <SectionHeading title="x402 spend" count={spend ? spend.payments : null} />
            <TileGrid className="grid-cols-1">
                <CellColumns
                    className={TILE}
                    title="Spend per day"
                    values={values}
                    startAt={spend?.startAt ?? 0}
                    bucketMs={DAY}
                    unit="spent"
                    format="cost"
                    rows={24}
                    state={chartState(spend ? values : null)}
                    summary={spend ? daySummary(values, spend.startAt) : "x402 spend per day is loading."}
                    readouts={spend ? readoutsOf(spend) : undefined}
                    emptyText={EMPTY}
                />
                <div className="grid grid-cols-3 gap-px max-[1180px]:grid-cols-1">
                    {groups.map((group) => (
                        <CellBars
                            key={group.title}
                            className={TILE}
                            title={group.title}
                            items={group.items}
                            unit="spent"
                            format="cost"
                            tone={group.title === "By payee" ? "signal" : "context"}
                            state={chartState(spend ? group.items.map((item) => item.value) : null)}
                            summary={barsSummary(group.what, group.items)}
                            emptyText={EMPTY}
                        />
                    ))}
                </div>
            </TileGrid>
        </section>
    );
}

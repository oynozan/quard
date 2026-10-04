import { CellBars, type BarItem } from "@/components/charts/cell-bars";
import { unitWord } from "@/components/charts/layout/format";
import { SectionHeading } from "@/components/kit/headings";
import type { FleetData } from "@/lib/data/fleet";
import { formatInt } from "@/lib/format";
import { barsSummary, chartState, sum } from "./lib/charts";
import { PAIR, TILE, TileGrid } from "./tile-grid";

const EMPTY = "No incidents in the last 30 days";

// Which sources let incidents in and which tools did the damage
export function IncidentPanes({ fleet }: { fleet: FleetData | null }) {
    const bySource = fleet?.incidentsBySource ?? [];
    const sources: BarItem[] = bySource.map((row) => ({ label: row.origin, value: row.count }));
    const tools: BarItem[] = (fleet?.incidentsByTool ?? []).map((row) => ({ label: row.tool, value: row.count }));
    const counts = (items: BarItem[]) => (fleet ? items.map((item) => item.value) : null);
    const total = sum(sources.map((item) => item.value));
    const untrusted = sum(bySource.filter((row) => row.trust === "untrusted").map((row) => row.count));

    return (
        <section aria-label="Where incidents start">
            <SectionHeading title="Where incidents start" count={fleet ? total : undefined} />
            <TileGrid className={PAIR}>
                <CellBars
                    className={TILE}
                    title="By entry source"
                    items={sources}
                    unit="incidents"
                    unitOne="incident"
                    state={chartState(counts(sources))}
                    summary={barsSummary(
                        "Incidents by the source where they entered",
                        sources,
                        "incidents",
                        "incident",
                    )}
                    readouts={[
                        {
                            label: "Untrusted",
                            value: formatInt(untrusted),
                            suffix: unitWord(untrusted, "incidents", "incident"),
                        },
                    ]}
                    emptyText={EMPTY}
                />
                <CellBars
                    className={TILE}
                    title="By damaging tool"
                    items={tools}
                    unit="incidents"
                    unitOne="incident"
                    tone="context"
                    state={chartState(counts(tools))}
                    summary={barsSummary(
                        "Incidents by the tool call that did the damage",
                        tools,
                        "incidents",
                        "incident",
                    )}
                    emptyText={EMPTY}
                />
            </TileGrid>
        </section>
    );
}

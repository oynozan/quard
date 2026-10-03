import { CellBars, type BarItem } from "@/components/charts/cell-bars";
import { SectionHeading } from "@/components/kit/headings";
import type { FleetData } from "@/lib/data/fleet";
import { formatInt } from "@/lib/format";
import { barsSummary, sum } from "./lib/charts";
import { TILE, TileGrid } from "./tile-grid";

// Which sources let incidents in and which tools did the damage
export function IncidentPanes({ fleet }: { fleet: FleetData | null }) {
    const state = fleet ? "ready" : "loading";
    const sources: BarItem[] = fleet?.incidentsBySource.map((row) => ({ label: row.origin, value: row.count })) ?? [];
    const tools: BarItem[] = fleet?.incidentsByTool.map((row) => ({ label: row.tool, value: row.count })) ?? [];
    const total = sum(sources.map((item) => item.value));
    const untrusted = fleet
        ? sum(fleet.incidentsBySource.filter((row) => row.label.trust === "untrusted").map((row) => row.count))
        : 0;

    return (
        <section aria-label="Where incidents start">
            <SectionHeading title="Where incidents start" count={fleet ? total : undefined} />
            <TileGrid className="grid-cols-2 max-[900px]:grid-cols-1">
                <CellBars
                    className={TILE}
                    title="By entry source"
                    items={sources}
                    unit="incidents"
                    unitOne="incident"
                    state={state}
                    summary={barsSummary("Incidents by the source where they entered", sources, "incidents")}
                    readouts={[{ label: "Untrusted", value: formatInt(untrusted), suffix: "incidents" }]}
                    emptyText="No incidents in the last 30 days"
                />
                <CellBars
                    className={TILE}
                    title="By damaging tool"
                    items={tools}
                    unit="incidents"
                    unitOne="incident"
                    tone="context"
                    state={state}
                    summary={barsSummary("Incidents by the tool call that did the damage", tools, "incidents")}
                    emptyText="No incidents in the last 30 days"
                />
            </TileGrid>
        </section>
    );
}

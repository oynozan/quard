import { CellBars, type BarItem } from "@/components/charts/cell-bars";
import { SectionHeading } from "@/components/kit/headings";
import type { FleetData } from "@/lib/data/fleet";
import { formatInt } from "@/lib/format";
import { barsSummary, sum } from "./lib/charts";
import { hasIncidents } from "./lib/sections";
import { EmptySection, LoadingSection } from "./section-states";
import { PAIR, TILE, TileGrid } from "./tile-grid";

const TITLE = "Where incidents start";

// Which sources let incidents in and which tools did the damage
export function IncidentPanes({ fleet }: { fleet: FleetData | null }) {
    if (!fleet) return <LoadingSection title={TITLE} />;
    if (!hasIncidents(fleet)) return <EmptySection title={TITLE}>No incidents in the last 30 days</EmptySection>;

    const sources: BarItem[] = fleet.incidentsBySource.map((row) => ({ label: row.origin, value: row.count }));
    const tools: BarItem[] = fleet.incidentsByTool.map((row) => ({ label: row.tool, value: row.count }));
    const total = sum(sources.map((item) => item.value));
    const damage = sum(tools.map((item) => item.value));
    const untrusted = sum(
        fleet.incidentsBySource.filter((row) => row.label.trust === "untrusted").map((row) => row.count),
    );

    return (
        <section aria-label={TITLE}>
            <SectionHeading title={TITLE} count={total > 0 ? total : undefined} />
            <TileGrid className={total > 0 && damage > 0 ? PAIR : undefined}>
                {total > 0 ? (
                    <CellBars
                        className={TILE}
                        title="By entry source"
                        items={sources}
                        unit="incidents"
                        unitOne="incident"
                        summary={barsSummary("Incidents by the source where they entered", sources, "incidents")}
                        readouts={[{ label: "Untrusted", value: formatInt(untrusted), suffix: "incidents" }]}
                    />
                ) : null}
                {damage > 0 ? (
                    <CellBars
                        className={TILE}
                        title="By damaging tool"
                        items={tools}
                        unit="incidents"
                        unitOne="incident"
                        tone="context"
                        summary={barsSummary("Incidents by the tool call that did the damage", tools, "incidents")}
                    />
                ) : null}
            </TileGrid>
        </section>
    );
}

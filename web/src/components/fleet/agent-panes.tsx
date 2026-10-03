import { ArrowRight } from "lucide-react";
import { CellBars, type BarItem } from "@/components/charts/cell-bars";
import { FitMeter } from "@/components/charts/fit";
import { DataTable, Td, Th, Tr } from "@/components/kit/data-table";
import { SectionHeading } from "@/components/kit/headings";
import { Pane } from "@/components/kit/pane";
import { SkeletonRows } from "@/components/kit/table/skeleton-rows";
import type { FleetData } from "@/lib/data/fleet";
import { formatInt, formatShare } from "@/lib/format";
import { barsSummary } from "./lib/charts";
import { hasAgentLinks } from "./lib/sections";
import { EmptySection } from "./section-states";
import { PAIR, TILE, TileGrid } from "./tile-grid";

const TITLE = "Agents and links";

type Points = FleetData["agentPoints"];
type Links = FleetData["untrustedLinks"];

function ranked(points: Points, key: "entry" | "turning"): BarItem[] {
    return points
        .filter((row) => row[key] > 0)
        .sort((a, b) => b[key] - a[key] || a.agent.localeCompare(b.agent))
        .map((row) => ({ label: row.agent, value: row[key] }));
}

// Which agents let incidents in or turned them harmful, and which links carry untrusted content
export function AgentPanes({ fleet }: { fleet: FleetData | null }) {
    // Only the links have a source, so only their table waits as a skeleton
    if (!fleet) {
        return (
            <section aria-label={TITLE}>
                <SectionHeading title={TITLE} />
                <TileGrid>
                    <LinksPane links={null} />
                </TileGrid>
            </section>
        );
    }
    if (!hasAgentLinks(fleet)) {
        return <EmptySection title={TITLE}>No untrusted links in the last 30 days</EmptySection>;
    }

    const entry = ranked(fleet.agentPoints, "entry");
    const turning = ranked(fleet.agentPoints, "turning");
    const links = fleet.untrustedLinks;

    return (
        <section aria-label={TITLE}>
            <SectionHeading title={TITLE} />
            <TileGrid className={entry.length > 0 && turning.length > 0 ? PAIR : undefined}>
                {entry.length > 0 ? (
                    <CellBars
                        className={TILE}
                        title="Entry points"
                        items={entry}
                        unit="incidents"
                        unitOne="incident"
                        summary={barsSummary("Agents that were the entry point of an incident", entry, "incidents")}
                    />
                ) : null}
                {turning.length > 0 ? (
                    <CellBars
                        className={TILE}
                        title="Turning points"
                        items={turning}
                        unit="incidents"
                        unitOne="incident"
                        tone="context"
                        summary={barsSummary("Agents where an incident turned harmful", turning, "incidents")}
                    />
                ) : null}
                {links.length > 0 ? <LinksPane links={links} /> : null}
            </TileGrid>
        </section>
    );
}

// The full-width links table, with skeleton rows while the links load
function LinksPane({ links }: { links: Links | null }) {
    return (
        <Pane title="Untrusted links" className={`${TILE} col-span-full`}>
            <DataTable minWidth={620} className="[&_th:first-child]:pl-3 [&_td:first-child]:pl-3">
                <colgroup>
                    <col style={{ width: "36%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "32%" }} />
                </colgroup>
                <thead>
                    <tr>
                        <Th className="border-t-0">Link</Th>
                        <Th className="border-t-0">Untrusted</Th>
                        <Th className="border-t-0">Delegations</Th>
                        <Th className="border-t-0">Untrusted share</Th>
                    </tr>
                </thead>
                {links ? (
                    <tbody>
                        {links.map((link) => (
                            // Agent names can hold any character, so a joined string could repeat
                            <Tr key={JSON.stringify([link.from, link.to])} className="last:[&_td]:border-b-0">
                                <Td>
                                    <span className="inline-flex items-center gap-2 text-[14px] text-ink">
                                        {link.from}
                                        <ArrowRight size={14} strokeWidth={0.75} aria-hidden />
                                        <span className="sr-only">to</span>
                                        {link.to}
                                    </span>
                                </Td>
                                <Td className="mono text-ink">{formatInt(link.untrusted)}</Td>
                                <Td className="mono text-ink-2">{formatInt(link.delegations)}</Td>
                                <Td>
                                    <span className="flex items-center justify-end gap-3">
                                        <span className="w-[132px]">
                                            <FitMeter
                                                value={link.untrusted}
                                                max={link.delegations}
                                                cells={16}
                                                initial={132}
                                                label={`${formatShare(link.untrustedShare)} of delegations from ${link.from} to ${link.to} carried untrusted content`}
                                            />
                                        </span>
                                        <span className="mono w-9 text-ink">{formatShare(link.untrustedShare)}</span>
                                    </span>
                                </Td>
                            </Tr>
                        ))}
                    </tbody>
                ) : (
                    <SkeletonRows columns={4} rows={4} label="Loading links…" />
                )}
            </DataTable>
        </Pane>
    );
}

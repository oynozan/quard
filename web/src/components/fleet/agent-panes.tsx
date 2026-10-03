import { ArrowRight } from "lucide-react";
import { CellBars, type BarItem } from "@/components/charts/cell-bars";
import { FitMeter } from "@/components/charts/fit";
import { DataTable, QuietEmpty, Td, Th, Tr } from "@/components/kit/data-table";
import { SectionHeading } from "@/components/kit/headings";
import { Pane } from "@/components/kit/pane";
import { SkeletonRows } from "@/components/kit/table/skeleton-rows";
import type { FleetData } from "@/lib/data/fleet";
import { formatInt, formatShare } from "@/lib/format";
import { barsSummary, chartState } from "./lib/charts";
import { PAIR, TILE, TileGrid } from "./tile-grid";

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
    const entry = ranked(fleet?.agentPoints ?? [], "entry");
    const turning = ranked(fleet?.agentPoints ?? [], "turning");
    const counts = (items: BarItem[]) => (fleet ? items.map((item) => item.value) : null);

    return (
        <section aria-label="Agents and links">
            <SectionHeading title="Agents and links" />
            <TileGrid className={PAIR}>
                <CellBars
                    className={TILE}
                    title="Entry points"
                    items={entry}
                    unit="incidents"
                    unitOne="incident"
                    state={chartState(counts(entry))}
                    summary={barsSummary(
                        "Agents that were the entry point of an incident",
                        entry,
                        "incidents",
                        "incident",
                    )}
                    emptyText="No agent was an entry point"
                />
                <CellBars
                    className={TILE}
                    title="Turning points"
                    items={turning}
                    unit="incidents"
                    unitOne="incident"
                    tone="context"
                    state={chartState(counts(turning))}
                    summary={barsSummary("Agents where an incident turned harmful", turning, "incidents", "incident")}
                    emptyText="No agent was a turning point"
                />
                {/* The grid's edge closes the pane, so the quiet line drops its own hairline */}
                <Pane
                    title="Untrusted links"
                    className={`${TILE} col-span-full`}
                    bodyClassName="[&>[role=status]]:border-b-0"
                >
                    <LinksTable links={fleet?.untrustedLinks ?? null} />
                </Pane>
            </TileGrid>
        </section>
    );
}

// The links table, with skeleton rows while the links load and one quiet line when there are none
function LinksTable({ links }: { links: Links | null }) {
    return (
        <>
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
            {links?.length === 0 ? <QuietEmpty>No agent-to-agent link carried untrusted content</QuietEmpty> : null}
        </>
    );
}

import { ArrowRight } from "lucide-react";
import { CellBars, type BarItem } from "@/components/charts/cell-bars";
import { FitMeter } from "@/components/charts/fit";
import { DataTable, QuietEmpty, Td, Th, Tr } from "@/components/kit/data-table";
import { SectionHeading } from "@/components/kit/headings";
import { Pane } from "@/components/kit/pane";
import { SkeletonRows } from "@/components/kit/table/skeleton-rows";
import type { FleetData } from "@/lib/data/fleet";
import { formatInt, formatShare } from "@/lib/format";
import { barsSummary } from "./lib/charts";
import { TILE, TileGrid } from "./tile-grid";

type Points = FleetData["agentPoints"];

function ranked(points: Points, key: "entry" | "turning"): BarItem[] {
    return points
        .filter((row) => row[key] > 0)
        .sort((a, b) => b[key] - a[key] || a.agent.localeCompare(b.agent))
        .map((row) => ({ label: row.agent, value: row[key] }));
}

// Which agents let incidents in or turned them harmful, and which links carry untrusted content
export function AgentPanes({ fleet }: { fleet: FleetData | null }) {
    const state = fleet ? "ready" : "loading";
    const entry = fleet ? ranked(fleet.agentPoints, "entry") : [];
    const turning = fleet ? ranked(fleet.agentPoints, "turning") : [];

    return (
        <section aria-label="Agents and links">
            <SectionHeading title="Agents and links" />
            <TileGrid className="grid-cols-2 max-[900px]:grid-cols-1">
                <CellBars
                    className={TILE}
                    title="Entry points"
                    items={entry}
                    unit="incidents"
                    unitOne="incident"
                    state={state}
                    summary={barsSummary("Agents that were the entry point of an incident", entry, "incidents")}
                    emptyText="No agent was an entry point"
                />
                <CellBars
                    className={TILE}
                    title="Turning points"
                    items={turning}
                    unit="incidents"
                    unitOne="incident"
                    tone="context"
                    state={state}
                    summary={barsSummary("Agents where an incident turned harmful", turning, "incidents")}
                    emptyText="No agent was a turning point"
                />
                <Pane title="Untrusted links" className={`${TILE} col-span-full`}>
                    <LinksTable links={fleet?.untrustedLinks ?? null} />
                </Pane>
            </TileGrid>
        </section>
    );
}

function LinksTable({ links }: { links: FleetData["untrustedLinks"] | null }) {
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
                        <Th className="border-t-0">All messages</Th>
                        <Th className="border-t-0">Untrusted share</Th>
                    </tr>
                </thead>
                {links === null ? (
                    <SkeletonRows columns={4} rows={4} label="Loading links…" />
                ) : (
                    <tbody>
                        {links.map((link) => (
                            <Tr key={`${link.from}-${link.to}`} className="last:[&_td]:border-b-0">
                                <Td>
                                    <span className="inline-flex items-center gap-2 text-[14px] text-ink">
                                        {link.from}
                                        <ArrowRight size={14} strokeWidth={0.75} aria-hidden />
                                        <span className="sr-only">to</span>
                                        {link.to}
                                    </span>
                                </Td>
                                <Td className="mono text-ink">{formatInt(link.untrusted)}</Td>
                                <Td className="mono text-ink-2">{formatInt(link.total)}</Td>
                                <Td>
                                    <span className="flex items-center justify-end gap-3">
                                        <span className="w-[132px]">
                                            <FitMeter
                                                value={link.untrusted}
                                                max={link.total}
                                                cells={16}
                                                initial={132}
                                                label={`${formatShare(link.untrustedShare)} of messages from ${link.from} to ${link.to} carry untrusted content`}
                                            />
                                        </span>
                                        <span className="mono w-9 text-ink">{formatShare(link.untrustedShare)}</span>
                                    </span>
                                </Td>
                            </Tr>
                        ))}
                    </tbody>
                )}
            </DataTable>
            {links !== null && links.length === 0 ? (
                <QuietEmpty>No agent-to-agent link carried untrusted content</QuietEmpty>
            ) : null}
        </>
    );
}

"use client";

import { useState } from "react";
import { FitMeter } from "@/components/charts/fit";
import { DataTable, Td, Th, Tr } from "@/components/kit/data-table";
import { SubHeading } from "@/components/kit/headings";
import type { WatchedValue } from "@/lib/data/fleet";
import { formatAge, formatLongDate } from "@/lib/format";
import { ValueCell } from "./value-cell";

type WatchingTableProps = { rows: WatchedValue[]; runsToBlock: number; now: number };

// New values the fleet check is still counting toward a block, drawn only when there are some
export function WatchingTable({ rows, runsToBlock, now }: WatchingTableProps) {
    const [expanded, setExpanded] = useState(false);
    if (rows.length === 0) return null;
    const sorted = [...rows].sort((a, b) => b.runs - a.runs || b.firstSeenAt - a.firstSeenAt);
    // Values seen in more than one run lead, and single-run values fold into one count behind them
    const lead = sorted.filter((row) => row.runs > 1);
    const folded = lead.length > 0 ? sorted.length - lead.length : 0;
    const shown = expanded || folded === 0 ? sorted : lead;
    return (
        <div className="mt-[22px]">
            <SubHeading>Watching</SubHeading>
            <DataTable minWidth={680}>
                <colgroup>
                    <col style={{ width: "36%" }} />
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "26%" }} />
                </colgroup>
                <thead>
                    <tr>
                        <Th>Value</Th>
                        <Th>Agents</Th>
                        <Th>First seen</Th>
                        <Th>Runs to block</Th>
                    </tr>
                </thead>
                <tbody>
                    {shown.map((row) => (
                        <Tr key={row.hash}>
                            <Td>
                                <ValueCell value={row} />
                            </Td>
                            <Td className="truncate text-[12px] text-ink-2" title={row.agents.join(", ")}>
                                {row.agents.join(", ")}
                            </Td>
                            <Td className="text-[12px] text-ink-2" title={formatLongDate(row.firstSeenAt)}>
                                {formatAge(row.firstSeenAt, now)} ago
                            </Td>
                            <Td>
                                <span className="flex items-center justify-end gap-3">
                                    <span className="w-[100px]">
                                        <FitMeter
                                            value={row.runs}
                                            max={runsToBlock}
                                            cells={runsToBlock * 2}
                                            initial={100}
                                            label={`${row.runs} of ${runsToBlock} runs before ${row.value} is blocked`}
                                        />
                                    </span>
                                    <span className="mono text-[12px] text-ink">
                                        {row.runs} / {runsToBlock}
                                    </span>
                                </span>
                            </Td>
                        </Tr>
                    ))}
                </tbody>
            </DataTable>
            {folded > 0 ? (
                <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setExpanded(!expanded)}
                    className="mt-3 rounded-[2px] text-[12px] font-light text-ink-muted underline decoration-line-hover underline-offset-[3px] transition-colors hover:text-ink-bright hover:decoration-ink-2"
                >
                    {expanded ? "Show fewer" : `${folded} more at 1 run`}
                </button>
            ) : null}
        </div>
    );
}

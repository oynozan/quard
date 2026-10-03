import { DataTable, QuietEmpty, Td, Th, Tr } from "@/components/kit/data-table";
import { SectionHeading } from "@/components/kit/headings";
import { Badge } from "@/components/kit/labels";
import type { AgentVersionRow } from "@/lib/data/agents";
import { formatShortDate, shortHash } from "@/lib/format";
import { plural } from "../lib/words";

// What changed in the tools since the version before
function toolChange(row: AgentVersionRow, before: AgentVersionRow | undefined): string {
    if (!before) return "First version";
    const added = row.tools.filter((tool) => !before.tools.includes(tool));
    const removed = before.tools.filter((tool) => !row.tools.includes(tool));
    const parts = [
        added.length ? `Added ${added.join(", ")}` : "",
        removed.length ? `Removed ${removed.join(", ")}` : "",
    ];
    return parts.filter(Boolean).join(" · ") || "Same tools";
}

// The tool list and its change, shown when hovering the version cell
function toolsTitle(row: AgentVersionRow, before: AgentVersionRow | undefined): string {
    const change = toolChange(row, before);
    if (row.tools.length === 0) return `No tools (${change})`;
    return `${row.tools.length} ${plural(row.tools.length, "tool")}: ${row.tools.join(", ")} (${change})`;
}

// Each version records its model, instructions and tools once, so an incident ties to the version behind it
export function VersionsTable({ versions }: { versions: AgentVersionRow[] }) {
    return (
        <section aria-label="Versions">
            <SectionHeading title="Versions" count={versions.length} />
            <DataTable minWidth={600}>
                <colgroup>
                    <col className="w-[40%]" />
                    <col className="w-[18%]" />
                    <col className="w-[18%]" />
                    <col className="w-[24%]" />
                </colgroup>
                <thead>
                    <tr>
                        <Th>Version</Th>
                        <Th>Model</Th>
                        <Th>Instructions</Th>
                        <Th>Live</Th>
                    </tr>
                </thead>
                <tbody>
                    {versions.map((row, i) => (
                        <Tr key={row.version}>
                            <Td title={toolsTitle(row, versions[i + 1])}>
                                <span className="flex min-w-0 items-center gap-2">
                                    <strong className="mono shrink-0 text-[14px] font-normal text-ink">
                                        {row.version}
                                    </strong>
                                    {row.current ? <Badge>Current</Badge> : null}
                                    <small className="min-w-0 truncate text-[11px] text-ink-note">{row.note}</small>
                                </span>
                            </Td>
                            <Td className="mono text-ink-2">{row.model}</Td>
                            <Td className="mono text-ink-2" title={row.instructionsHash}>
                                {shortHash(row.instructionsHash)}
                            </Td>
                            <Td className="text-ink-2">
                                <span className="mono">{formatShortDate(row.since)}</span>
                                {row.until ? (
                                    <>
                                        {" "}
                                        to <span className="mono">{formatShortDate(row.until)}</span>
                                    </>
                                ) : (
                                    <span className="text-ink-muted"> to now</span>
                                )}
                            </Td>
                        </Tr>
                    ))}
                </tbody>
            </DataTable>
            {versions.length === 0 ? <QuietEmpty>No versions yet</QuietEmpty> : null}
        </section>
    );
}

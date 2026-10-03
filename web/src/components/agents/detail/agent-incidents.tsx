import { Absent } from "@/components/kit/detail/detail-list";
import { DataTable, Td, Th, Tr } from "@/components/kit/data-table";
import { EmptyLine } from "@/components/kit/empty";
import { SectionHeading } from "@/components/kit/headings";
import { Badge } from "@/components/kit/labels";
import { RowChevron, RowLink } from "@/components/kit/links";
import type { AgentDetail, AgentVersionRow } from "@/lib/data/agents";
import { formatShortDate } from "@/lib/format";
import { plural, ROLE_WORD } from "../lib/words";

type Row = AgentDetail["incidents"][number];

type IncidentsProps = { incidents: Row[]; versions: AgentVersionRow[] };

// Incidents where the root-cause finder named this agent as the entry or the turning point
export function AgentIncidents({ incidents, versions }: IncidentsProps) {
    const named = incidents.filter((row) => row.roles.includes("entry") || row.roles.includes("turning"));
    if (named.length === 0) {
        return (
            <section aria-label="Incidents">
                <SectionHeading title="Incidents" />
                <EmptyLine>
                    {incidents.length
                        ? `Damage only, in ${incidents.length} ${plural(incidents.length, "incident")}`
                        : "No incidents yet"}
                </EmptyLine>
            </section>
        );
    }
    const versionOf = (id: string) => versions.find((row) => row.incidents.includes(id))?.version;
    return (
        <section aria-label="Incidents">
            <SectionHeading title="Incidents" count={named.length} href="/incidents" />
            <DataTable minWidth={560}>
                <colgroup>
                    <col className="w-[46%]" />
                    <col className="w-[12%]" />
                    <col className="w-[26%]" />
                    <col className="w-[16%]" />
                </colgroup>
                <thead>
                    <tr>
                        <Th>Incident</Th>
                        <Th>Version</Th>
                        <Th>Role</Th>
                        <Th>Opened</Th>
                    </tr>
                </thead>
                <tbody>
                    {named.map((row) => (
                        <Tr key={row.id} interactive>
                            <Td>
                                <RowLink href={`/incidents/${row.id}`} className="flex">
                                    <strong
                                        className="truncate text-[14px] font-[450] text-ink group-hover/row:text-ink-bright"
                                        title={row.title}
                                    >
                                        {row.title}
                                    </strong>
                                </RowLink>
                            </Td>
                            <Td className="mono text-ink-2">{versionOf(row.id) ?? <Absent>—</Absent>}</Td>
                            <Td>
                                <span className="flex flex-wrap gap-[6px]">
                                    {row.roles.map((role) => (
                                        <Badge key={role}>{ROLE_WORD[role]}</Badge>
                                    ))}
                                </span>
                            </Td>
                            <Td className="mono text-ink-2">
                                {formatShortDate(row.openedAt)}
                                <RowChevron />
                            </Td>
                        </Tr>
                    ))}
                </tbody>
            </DataTable>
        </section>
    );
}

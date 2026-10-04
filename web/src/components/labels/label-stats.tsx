import { DataTable, Td, Th, Tr } from "@/components/kit/data-table";
import { SectionHeading } from "@/components/kit/headings";
import type { LabelStatRow } from "@/lib/data/content-labels/types";
import { formatInt, formatShare } from "@/lib/format";
import { LabelName } from "./label-name";

const share = (part: number, whole: number) => (whole === 0 ? "—" : formatShare(part / whole));

// Reviewed examples per label, and how often a review kept it
export function LabelStats({ rows }: { rows: LabelStatRow[] }) {
    return (
        <section aria-label="Per label">
            <SectionHeading title="Per label" />
            <DataTable minWidth={720}>
                <colgroup>
                    <col style={{ width: "28%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "24%" }} />
                </colgroup>
                <thead>
                    <tr>
                        <Th>Label</Th>
                        <Th>To review</Th>
                        <Th>Reviewed</Th>
                        <Th>Right</Th>
                        <Th>Right when flagged</Th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <Tr key={row.label}>
                            <Td>
                                <LabelName label={row.label} />
                            </Td>
                            <Td className="mono text-[12px] text-ink-2">{formatInt(row.open)}</Td>
                            <Td className="mono text-[12px] text-ink">{formatInt(row.reviewed)}</Td>
                            <Td className="mono text-[12px] text-ink-2">{share(row.right, row.reviewed)}</Td>
                            <Td className="mono text-[12px] text-ink-2">
                                {row.risky ? share(row.flaggedRight, row.flagged) : ""}
                            </Td>
                        </Tr>
                    ))}
                </tbody>
            </DataTable>
        </section>
    );
}

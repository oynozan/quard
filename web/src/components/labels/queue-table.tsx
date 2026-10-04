import { DataTable, NameCell, Td, Th, Tr } from "@/components/kit/data-table";
import { Button } from "@/components/ui/button";
import type { ReviewChunk } from "@/lib/data/content-labels/types";
import { formatAge, formatLongDate, formatShare } from "@/lib/format";
import { FallbackValue, LabelName } from "./label-name";

type QueueTableProps = { rows: ReviewChunk[]; now: number; onReview: (row: ReviewChunk) => void };

// Chunks nobody reviewed yet, least sure first
export function QueueTable({ rows, now, onReview }: QueueTableProps) {
    return (
        <DataTable minWidth={820}>
            <colgroup>
                <col style={{ width: "40%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
                <tr>
                    <Th>Chunk</Th>
                    <Th>Label</Th>
                    <Th>AI fallback</Th>
                    <Th>Seen</Th>
                    <Th>
                        <span className="sr-only">Actions</span>
                    </Th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => (
                    <Tr key={row.eventId}>
                        <Td>
                            <NameCell name={<span title={row.text}>{row.text}</span>} sub={row.origin} />
                        </Td>
                        <Td>
                            <span className="flex flex-col">
                                <LabelName label={row.label} />
                                <small className="mono text-[11px] text-ink-note">
                                    {formatShare(row.confidence)} sure
                                </small>
                            </span>
                        </Td>
                        <Td>
                            <FallbackValue fallback={row.fallback} />
                        </Td>
                        <Td className="text-[12px] text-ink-2" title={formatLongDate(row.at)}>
                            {formatAge(row.at, now)} ago
                        </Td>
                        <Td>
                            <Button
                                size="sm"
                                onClick={() => onReview(row)}
                                aria-label={`Review the chunk from ${row.origin}`}
                            >
                                Review
                            </Button>
                        </Td>
                    </Tr>
                ))}
            </tbody>
        </DataTable>
    );
}

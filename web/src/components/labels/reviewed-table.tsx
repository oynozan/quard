import { DataTable, NameCell, QuietEmpty, Td, Th, Tr } from "@/components/kit/data-table";
import { SectionHeading } from "@/components/kit/headings";
import type { ReviewChunk } from "@/lib/data/content-labels/types";
import { formatAge, formatLongDate } from "@/lib/format";
import { LabelName } from "./label-name";

// The latest reviews, with who made them
export function ReviewedTable({ rows, now }: { rows: ReviewChunk[]; now: number }) {
    return (
        <section aria-label="Reviewed">
            <SectionHeading title="Reviewed" />
            <DataTable minWidth={820}>
                <colgroup>
                    <col style={{ width: "36%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "12%" }} />
                </colgroup>
                <thead>
                    <tr>
                        <Th>Chunk</Th>
                        <Th>Detector said</Th>
                        <Th>Reviewed as</Th>
                        <Th>By</Th>
                        <Th>When</Th>
                    </tr>
                </thead>
                <tbody>
                    {rows.flatMap((row) =>
                        row.review === null
                            ? []
                            : [
                                  <Tr key={row.eventId}>
                                      <Td>
                                          <NameCell name={<span title={row.text}>{row.text}</span>} sub={row.origin} />
                                      </Td>
                                      <Td>
                                          <LabelName label={row.label} />
                                      </Td>
                                      <Td>
                                          <LabelName label={row.review.label} />
                                      </Td>
                                      <Td className="truncate text-[12px] text-ink-2">{row.review.by}</Td>
                                      <Td className="text-[12px] text-ink-2" title={formatLongDate(row.review.at)}>
                                          {formatAge(row.review.at, now)} ago
                                      </Td>
                                  </Tr>,
                              ],
                    )}
                </tbody>
            </DataTable>
            {rows.length === 0 ? <QuietEmpty>No reviews yet</QuietEmpty> : null}
        </section>
    );
}

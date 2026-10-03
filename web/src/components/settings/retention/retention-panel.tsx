import { DataTable, TableState, Td, Tr } from "@/components/kit/data-table";
import { DetailList, DetailRow } from "@/components/kit/detail/detail-list";
import { SectionHeading } from "@/components/kit/headings";
import type { RetentionRow } from "@/lib/data/settings";
import { Cols, FIRST_CELL, Head } from "../shared/table-parts";

// "30 days" with the figure in mono, while words like "Kept" stay in Manrope
function Keep({ row }: { row: RetentionRow }) {
    const [figure, ...unit] = row.keep.split(" ");
    if (row.days === null || !/^\d+$/.test(figure)) return <span className="text-ink">{row.keep}</span>;
    return (
        <span className="text-ink">
            <span className="mono">{figure}</span> {unit.join(" ")}
        </span>
    );
}

// The rows are empty only before the install has a project
export function RetentionPanel({ retention }: { retention: RetentionRow[] }) {
    return (
        <section aria-label="Retention">
            <DataTable minWidth={420} className="text-[14px]">
                <caption className="sr-only">What Quard keeps and for how long</caption>
                <Cols widths={["70%", "30%"]} />
                <Head first="Data" rest={["Kept for"]} />
                <tbody>
                    {retention.map((row) => (
                        <Tr key={row.item}>
                            <Td colSpan={2} className={`${FIRST_CELL} font-[450] text-ink`}>
                                {row.item}
                            </Td>
                            <Td>
                                <Keep row={row} />
                            </Td>
                        </Tr>
                    ))}
                </tbody>
            </DataTable>
            {retention.length === 0 ? (
                <TableState title="No project yet" body="Creating the first agent key sets up the project." />
            ) : null}

            <div className="mt-10 grid grid-cols-2 gap-10 max-[980px]:grid-cols-1 max-[760px]:mt-8 max-[760px]:gap-8">
                <div>
                    <SectionHeading title="Redaction" />
                    {/* Facts from PROJECT.md "Redaction" */}
                    <DetailList>
                        <DetailRow term="Sensitive values">IBANs, cards, emails and secrets</DetailRow>
                        <DetailRow term="Stored as" mono>
                            HMAC-SHA-256
                        </DetailRow>
                    </DetailList>
                </div>
            </div>
        </section>
    );
}

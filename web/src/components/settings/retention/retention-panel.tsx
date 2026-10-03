import { DataTable, Td, Tr } from "@/components/kit/data-table";
import { Absent, DetailList, DetailRow, StatusValue } from "@/components/kit/detail/detail-list";
import { SectionHeading } from "@/components/kit/headings";
import type { RetentionRow, SettingsData } from "@/lib/data/settings";
import { formatLongDate, formatShortDate } from "@/lib/format";
import { Cols, FIRST_CELL, Head } from "../shared/table-parts";

type RetentionPanelProps = Pick<SettingsData, "retention" | "hashKey" | "detector">;

// "30 days" with the figure in mono; words like "Kept" stay in Manrope
function Keep({ row }: { row: RetentionRow }) {
    const [figure, ...unit] = row.keep.split(" ");
    if (row.days === null || !/^\d+$/.test(figure)) return <span className="text-ink">{row.keep}</span>;
    return (
        <span className="text-ink">
            <span className="mono">{figure}</span> {unit.join(" ")}
        </span>
    );
}

export function RetentionPanel({ retention, hashKey, detector }: RetentionPanelProps) {
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

            <div className="mt-10 grid grid-cols-2 gap-10 max-[980px]:grid-cols-1 max-[760px]:mt-8 max-[760px]:gap-8">
                <div>
                    <SectionHeading title="Redaction" />
                    <DetailList>
                        <DetailRow term="Sensitive values">IBANs, cards, emails and secrets</DetailRow>
                        <DetailRow term="Stored as" mono>
                            {hashKey.algorithm}
                        </DetailRow>
                        <DetailRow term="Hash key set" title={formatLongDate(hashKey.setAt)}>
                            <span className="mono">{formatShortDate(hashKey.setAt)}</span>
                        </DetailRow>
                        <DetailRow term="Previous key">
                            {hashKey.previousKeptUntil === null ? (
                                <Absent>None kept</Absent>
                            ) : (
                                <span className="mono">until {formatShortDate(hashKey.previousKeptUntil)}</span>
                            )}
                        </DetailRow>
                    </DetailList>
                </div>
                <div>
                    <SectionHeading title="Detector" />
                    <DetailList>
                        <DetailRow term="Model">{detector.name}</DetailRow>
                        <DetailRow term="Version" mono>
                            {detector.version}
                        </DetailRow>
                        <DetailRow term="Mode">
                            <StatusValue tone="context">
                                {detector.mode === "observe" ? "Observe only" : "Blocks"}
                            </StatusValue>
                        </DetailRow>
                    </DetailList>
                </div>
            </div>
        </section>
    );
}

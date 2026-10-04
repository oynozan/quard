import { DataTable, Th } from "@/components/kit/data-table";
import { PageHeading, SectionHeading } from "@/components/kit/headings";
import { PAGE_LIST } from "@/components/kit/page";
import { SkeletonRows } from "@/components/kit/table/skeleton-rows";

export default function Loading() {
    return (
        <div aria-busy className={PAGE_LIST}>
            <PageHeading title="Labels" />
            <p role="status" className="sr-only">
                Loading labels…
            </p>
            <section aria-hidden>
                <SectionHeading title="To review" count={null} />
                <DataTable minWidth={820}>
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
                    <SkeletonRows columns={5} rows={5} />
                </DataTable>
            </section>
        </div>
    );
}

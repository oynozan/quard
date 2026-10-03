import { DataTable, Th } from "@/components/kit/data-table";
import { PageHeading, SectionHeading } from "@/components/kit/headings";
import { SkeletonRows } from "@/components/kit/table/skeleton-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { PAGE_LIST } from "@/components/kit/page";

function CardSkeleton() {
    return (
        <div
            aria-hidden
            className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-x-10 rounded-md bg-panel p-[18px] max-[1180px]:grid-cols-1"
        >
            <div className="grid gap-3">
                <Skeleton width={130} height={16} />
                <Skeleton width={260} height={10} />
                <Skeleton width={200} height={10} />
                <Skeleton width="100%" height={28} className="mt-4" />
                <Skeleton width="100%" height={28} />
                <Skeleton width="100%" height={28} />
            </div>
            <div className="grid content-start gap-4 max-[1180px]:mt-6">
                <Skeleton width={110} height={10} />
                <Skeleton width="80%" height={12} />
                <Skeleton width="70%" height={12} />
                <Skeleton width="75%" height={12} />
            </div>
        </div>
    );
}

export default function Loading() {
    return (
        <div aria-busy className={PAGE_LIST}>
            <PageHeading title="Approvals" />
            <p role="status" className="sr-only">
                Loading approvals…
            </p>
            <div className="grid gap-10 max-[760px]:gap-8">
                <section aria-hidden>
                    <SectionHeading title="Waiting for an answer" count={null} />
                    <div className="grid gap-6">
                        <CardSkeleton />
                        <CardSkeleton />
                    </div>
                </section>
                <section aria-hidden>
                    <SectionHeading title="Always approve" count={null} />
                    <DataTable minWidth={880}>
                        <thead>
                            <tr>
                                <Th>Grant</Th>
                                <Th>Arguments</Th>
                                <Th>Argument hash</Th>
                                <Th>Approved by</Th>
                                <Th>Used</Th>
                                <Th>
                                    <span className="sr-only">Actions</span>
                                </Th>
                            </tr>
                        </thead>
                        <SkeletonRows columns={6} rows={4} />
                    </DataTable>
                </section>
            </div>
        </div>
    );
}

import { DataTable, Th } from "@/components/kit/data-table";
import { PageHeading } from "@/components/kit/headings";
import { SkeletonRows } from "@/components/kit/table/skeleton-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { PAGE_LIST } from "@/components/kit/page";

export default function IncidentsLoading() {
    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Incidents" />
            <div className="mb-[14px] flex h-8 items-center gap-2">
                <Skeleton width={240} height={12} />
                <Skeleton width={110} height={12} />
            </div>
            <DataTable minWidth={960}>
                <thead>
                    <tr>
                        <Th>Incident</Th>
                        <Th>Category</Th>
                        <Th>Entry point</Th>
                        <Th>Damage</Th>
                        <Th>Agents</Th>
                        <Th>Replay</Th>
                        <Th>Opened</Th>
                    </tr>
                </thead>
                <SkeletonRows columns={7} rows={6} label="Loading incidents…" />
            </DataTable>
        </div>
    );
}

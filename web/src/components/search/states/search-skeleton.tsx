import { DataTable } from "@/components/kit/data-table";
import { SkeletonRows } from "@/components/kit/table/skeleton-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { SEARCH_COLUMNS, SEARCH_MIN_WIDTH, SearchColgroup, SearchHead } from "../results/search-columns";

// The field and results while a search loads, sized like the real ones
export function SearchSkeleton() {
    return (
        <div>
            <div aria-hidden className="flex gap-2 max-[760px]:flex-col">
                <span className="h-[46px] min-w-0 flex-1 rounded-md bg-control max-[760px]:flex-none" />
                <span className="h-[46px] w-[96px] rounded-md bg-control-hover max-[760px]:w-full" />
            </div>
            <div className="mt-[30px] max-[760px]:mt-[25px]">
                <div aria-hidden className="mb-4 flex items-center gap-[10px]">
                    <Skeleton width={150} height={12} />
                    <Skeleton width={52} height={12} />
                </div>
                <DataTable minWidth={SEARCH_MIN_WIDTH} className="text-[14px]">
                    <SearchColgroup />
                    <SearchHead />
                    <SkeletonRows columns={SEARCH_COLUMNS - 1} selection label="Searching runs…" />
                </DataTable>
            </div>
        </div>
    );
}

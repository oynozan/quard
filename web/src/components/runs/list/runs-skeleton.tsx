import { DataTable } from "@/components/kit/data-table";
import { SkeletonRows } from "@/components/kit/table/skeleton-rows";
import { RUNS_COLUMNS, RUNS_MIN_WIDTH, RunsColgroup, RunsHead } from "./runs-columns";

// The toolbar and table while runs load, sized like the real controls and rows.
export function RunsSkeleton() {
    return (
        <div>
            <div aria-hidden className="mb-[14px] flex flex-wrap items-center gap-2">
                <span className="h-8 max-w-[360px] min-w-0 flex-1 rounded-md bg-control max-[760px]:basis-full" />
                <span className="h-8 w-[130px] rounded-md bg-control-hover" />
                <span className="h-8 w-[130px] rounded-md bg-control-hover" />
            </div>
            <DataTable minWidth={RUNS_MIN_WIDTH} className="text-[14px]">
                <RunsColgroup />
                <RunsHead />
                <SkeletonRows columns={RUNS_COLUMNS - 1} selection label="Loading runs…" />
            </DataTable>
        </div>
    );
}

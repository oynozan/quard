import { RunsHeading } from "@/components/runs/list/runs-heading";
import { RunsSkeleton } from "@/components/runs/list/runs-skeleton";
import { PAGE_LIST } from "@/components/kit/page";

export default function RunsLoading() {
    return (
        <div className={PAGE_LIST}>
            <RunsHeading count={null} />
            <RunsSkeleton />
        </div>
    );
}

import { PageHeading } from "@/components/kit/headings";
import { PAGE_LIST } from "@/components/kit/page";
import { Skeleton } from "@/components/ui/skeleton";

// One bar where the page's line goes, since nothing stores incidents yet
export default function IncidentsLoading() {
    return (
        <div aria-busy className={PAGE_LIST}>
            <PageHeading title="Incidents" />
            <p role="status" className="sr-only">
                Loading incidents…
            </p>
            <Skeleton width={140} height={12} />
        </div>
    );
}

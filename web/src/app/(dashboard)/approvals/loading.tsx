import { PageHeading } from "@/components/kit/headings";
import { PAGE_LIST } from "@/components/kit/page";
import { Skeleton } from "@/components/ui/skeleton";

// One bar where the page's line goes, since nothing stores approvals yet
export default function Loading() {
    return (
        <div aria-busy className={PAGE_LIST}>
            <PageHeading title="Approvals" />
            <p role="status" className="sr-only">
                Loading approvals…
            </p>
            <Skeleton width={180} height={12} />
        </div>
    );
}

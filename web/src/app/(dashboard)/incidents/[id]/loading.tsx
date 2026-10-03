import { Skeleton } from "@/components/ui/skeleton";
import { PAGE_LIST } from "@/components/kit/page";

// A bar for the title and one under it, since nothing stores incidents yet
export default function IncidentLoading() {
    return (
        <div aria-busy className={PAGE_LIST}>
            <p role="status" className="sr-only">
                Loading the incident…
            </p>
            <Skeleton width={420} height={22} className="mb-[30px] max-w-full" />
            <Skeleton width={180} height={12} />
        </div>
    );
}

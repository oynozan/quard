import { Skeleton } from "@/components/ui/skeleton";
import { PAGE_LIST } from "@/components/kit/page";

// Bars sized like the title, the path nodes and the verdict rows.
export default function IncidentLoading() {
    return (
        <div aria-busy className={PAGE_LIST}>
            <p role="status" className="sr-only">
                Loading the incident…
            </p>
            <Skeleton width={80} height={10} className="mb-[22px]" />
            <Skeleton width={420} height={22} className="mb-[30px] max-w-full" />
            <div className="flex gap-[22px] overflow-hidden border border-line p-3 pt-[50px]">
                {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex w-[214px] shrink-0 flex-col gap-3 bg-panel p-3">
                        <Skeleton width={90} height={10} />
                        <Skeleton width={150} height={12} />
                        <Skeleton width={120} height={10} />
                    </div>
                ))}
            </div>
            <div className="mt-[30px] grid grid-cols-[minmax(0,1fr)_400px] gap-7 max-[1180px]:grid-cols-1">
                <div className="h-[320px] border border-line" />
                <div className="flex flex-col">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex justify-between border-b border-line py-3">
                            <Skeleton width={70} height={10} />
                            <Skeleton width={140} height={10} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

import { Skeleton } from "@/components/ui/skeleton";
import { PAGE_WIDE } from "@/components/kit/page";

// Bars sized like the values they stand in for. The timeline keeps its lanes.
export default function RunLoading() {
    return (
        <div aria-busy className={PAGE_WIDE}>
            <p role="status" className="sr-only">
                Loading run…
            </p>
            <div className="mb-[14px]">
                <Skeleton width={90} height={10} />
            </div>
            <div className="mb-[26px]">
                <Skeleton width={190} height={26} />
                <div className="mt-3">
                    <Skeleton width={420} height={10} />
                </div>
            </div>
            <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,2fr)] gap-[10px] max-[980px]:grid-cols-3 max-[560px]:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="flex h-[74px] flex-col justify-between bg-panel p-3 max-[980px]:last:col-span-3 max-[560px]:last:col-span-2"
                    >
                        <Skeleton width={60} height={9} />
                        <Skeleton width={52} height={26} />
                    </div>
                ))}
            </div>
            <section className="mt-7 border border-line">
                <div className="h-[38px] border-b border-line bg-recess" />
                <div className="grid gap-[28px] p-3 pt-6">
                    {[0, 1, 2].map((lane) => (
                        <div key={lane} className="flex items-center gap-[10px]">
                            <Skeleton width={90} height={10} />
                            <span className="h-[18px] flex-1 bg-chart-field" />
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

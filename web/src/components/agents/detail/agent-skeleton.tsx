import { PaneHeader } from "@/components/kit/pane";
import { Skeleton } from "@/components/ui/skeleton";
import { PageFrame } from "../list/page-frame";
import { STAT_GRID } from "./agent-stats";

// Bars sized like the values they stand in for; panes keep their headers
export function AgentSkeleton() {
    return (
        <PageFrame busy>
            <p role="status" className="sr-only">
                Loading agent…
            </p>
            <div className="mb-[26px]">
                <Skeleton width={110} height={10} />
                <div className="mt-[14px]">
                    <Skeleton width={170} height={26} />
                </div>
                <div className="mt-3">
                    <Skeleton width={420} height={10} />
                </div>
            </div>
            <div className="mb-2">
                <Skeleton width={54} height={9} />
            </div>
            <div className={STAT_GRID}>
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex h-[86px] flex-col justify-between bg-panel p-3">
                        <Skeleton width={60} height={9} />
                        <Skeleton width={52} height={26} />
                    </div>
                ))}
            </div>
            <div className="mt-7 grid grid-cols-[minmax(0,1fr)_360px] items-start gap-7 max-[1180px]:grid-cols-1">
                <section aria-hidden className="border border-line">
                    <PaneHeader title="Recent calls" />
                    <div className="grid gap-[6px] p-3 pt-10">
                        {[0, 1, 2, 3].map((lane) => (
                            <div key={lane} className="flex items-center gap-3">
                                <Skeleton width={80} height={10} />
                                <span className="h-3 flex-1 bg-chart-field" />
                            </div>
                        ))}
                    </div>
                </section>
                <section aria-hidden className="border border-line">
                    <PaneHeader title="Permissions" />
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="grid gap-2 border-b border-line px-3 py-[14px] last:border-b-0">
                            <Skeleton width={90} height={9} />
                            <Skeleton width={220} height={12} />
                        </div>
                    ))}
                </section>
            </div>
        </PageFrame>
    );
}

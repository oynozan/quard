import { PaneHeader } from "@/components/kit/pane";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentsGrid, PageFrame } from "./page-frame";

// Bars sized like the values they stand in for; the graph keeps its height
export function AgentsSkeleton() {
    return (
        <PageFrame busy>
            <p role="status" className="sr-only">
                Loading agents…
            </p>
            <div className="mb-[26px]">
                <Skeleton width={120} height={26} />
            </div>
            <AgentsGrid>
                <section aria-hidden className="border border-line">
                    <PaneHeader title="Agent graph" tag="30D" />
                    <div className="p-3">
                        <div className="mb-3 flex flex-wrap gap-5">
                            {[0, 1, 2].map((i) => (
                                <Skeleton key={i} width={86} height={10} />
                            ))}
                        </div>
                        <div className="grid h-[312px] grid-cols-2 content-around px-[130px] max-[600px]:px-3">
                            {[0, 1, 2, 3].map((row) => (
                                <div key={row} className="contents">
                                    <span className="size-[14px] bg-chart-field" />
                                    <span className="size-[14px] justify-self-end bg-chart-field" />
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
                <section aria-hidden className="border border-line">
                    <PaneHeader title="Agents" />
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                        <div
                            key={i}
                            className="flex justify-between border-b border-line px-3 py-[15px] last:border-b-0"
                        >
                            <Skeleton width={120} height={12} />
                            <Skeleton width={70} height={9} />
                        </div>
                    ))}
                </section>
            </AgentsGrid>
        </PageFrame>
    );
}

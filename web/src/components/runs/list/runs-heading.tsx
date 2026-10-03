import { CountChip } from "@/components/kit/headings";
import { Skeleton } from "@/components/ui/skeleton";

// The page title with the number of runs shown. Null draws a skeleton chip; undefined draws none.
export function RunsHeading({ count, filtered }: { count?: number | null; filtered?: boolean }) {
    return (
        <div className="mb-[26px] flex items-center gap-6 max-[760px]:mb-[22px]">
            <h1 className="text-[26px] leading-[1.3] font-extralight tracking-[-0.2px] max-[760px]:text-[25px]">
                Runs
                {count === null ? (
                    <span className="ml-2 inline-block align-[3px]">
                        <Skeleton width={22} height={18} />
                    </span>
                ) : count === undefined ? null : (
                    <span title={filtered ? "Runs that match the filters" : "Runs in the last 6 hours"}>
                        <CountChip value={count} />
                    </span>
                )}
            </h1>
        </div>
    );
}

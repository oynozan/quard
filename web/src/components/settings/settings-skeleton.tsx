import { DataTable } from "@/components/kit/data-table";
import { SkeletonRows } from "@/components/kit/table/skeleton-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { KEY_HEADERS, KEY_MIN_WIDTH, KEY_WIDTHS } from "./keys/columns";
import { Cols, Head } from "./shared/table-parts";
import { SETTINGS_TABS } from "./tabs";

// The settings frame while data loads, with real tab labels, a skeleton intro and key rows
export function SettingsSkeleton() {
    return (
        <div aria-busy="true">
            <div className="flex flex-wrap items-center gap-1" aria-hidden>
                {SETTINGS_TABS.map((tab) => (
                    <span
                        key={tab.value}
                        className="inline-flex min-h-[37px] items-center rounded-md px-[10px] text-[14px] text-ink-faint"
                    >
                        {tab.label}
                    </span>
                ))}
            </div>
            <div className="mt-[30px] mb-[22px] flex min-h-9 items-center max-[760px]:mt-[25px]">
                <Skeleton width="min(280px, 70%)" />
            </div>
            <DataTable minWidth={KEY_MIN_WIDTH} className="text-[14px]">
                <Cols widths={KEY_WIDTHS} />
                <Head first="Key" rest={[...KEY_HEADERS, ""]} />
                <SkeletonRows columns={KEY_WIDTHS.length} selection label="Loading settings…" />
            </DataTable>
        </div>
    );
}

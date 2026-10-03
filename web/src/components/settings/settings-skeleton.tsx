import { DataTable } from "@/components/kit/data-table";
import { SkeletonRows } from "@/components/kit/table/skeleton-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { Cols, Head } from "./shared/table-parts";
import { SETTINGS_TABS } from "./tabs";

// The settings frame while data loads: real tab labels, skeleton intro and key rows
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
            <DataTable minWidth={940} className="text-[14px]">
                <Cols widths={["22%", "20%", "15%", "8%", "10%", "10%", "15%"]} />
                <Head first="Key" rest={["Scope and agents", "Owner", "Created", "Last used", "Status", ""]} />
                <SkeletonRows columns={7} selection label="Loading settings…" />
            </DataTable>
        </div>
    );
}

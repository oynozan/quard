import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { DataTable, TableState } from "@/components/kit/data-table";
import { RUNS_MIN_WIDTH, RunsColgroup, RunsHead } from "./runs-columns";

// The header row with a centered state block under it, as full tables show empties
function StateFrame({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <DataTable minWidth={RUNS_MIN_WIDTH} className="text-[14px]">
                <RunsColgroup />
                <RunsHead />
            </DataTable>
            <div role="status" className="min-h-[320px] border-b border-line [&>div]:min-h-[320px]">
                {children}
            </div>
        </div>
    );
}

export function RunsEmpty() {
    return (
        <StateFrame>
            <TableState title="No runs yet" />
        </StateFrame>
    );
}

export function RunsNoMatch() {
    return (
        <StateFrame>
            <TableState
                title="No runs match"
                action={
                    <Link href="/runs" scroll={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        Clear filters
                    </Link>
                }
            />
        </StateFrame>
    );
}

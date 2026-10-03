import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { TableState } from "@/components/kit/data-table";

// Filters that match nothing get the message and a way back, with no table under the toolbar
export function RunsNoMatch() {
    return (
        <div role="status" className="[&>div]:min-h-[320px]">
            <TableState
                title="No runs match"
                action={
                    <Link href="/runs" scroll={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        Clear filters
                    </Link>
                }
            />
        </div>
    );
}

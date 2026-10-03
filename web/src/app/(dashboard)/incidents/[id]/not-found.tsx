import Link from "next/link";
import { PageHeading } from "@/components/kit/headings";
import { TableState } from "@/components/kit/data-table";
import { buttonVariants } from "@/components/ui/button";
import { PAGE_LIST } from "@/components/kit/page";

export default function IncidentNotFound() {
    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Incident not found" />
            <div className="border-y border-line">
                <TableState
                    title="No incident with this id"
                    body="It may have been removed by retention, or the link is wrong."
                    action={
                        <Link href="/incidents" className={buttonVariants({ variant: "outline", size: "sm" })}>
                            All incidents
                        </Link>
                    }
                />
            </div>
        </div>
    );
}

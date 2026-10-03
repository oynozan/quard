import type { Metadata } from "next";
import { PageHeading } from "@/components/kit/headings";
import { ApprovalsBoard } from "@/components/approvals/approvals-board";
import { getApprovals } from "@/lib/data/approvals/query";
import { NOW } from "@/lib/data/rng";
import { PAGE_LIST } from "@/components/kit/page";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
    const data = await getApprovals();

    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Approvals" />
            <div className="reveal grid min-w-0 grid-cols-1 gap-10 max-[760px]:gap-8">
                <ApprovalsBoard data={data} now={NOW} />
            </div>
        </div>
    );
}

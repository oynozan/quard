import type { Metadata } from "next";
import { ApprovalsBoard } from "@/components/approvals/approvals-board";
import { EmptyLine } from "@/components/kit/empty";
import { PageHeading } from "@/components/kit/headings";
import { PAGE_LIST } from "@/components/kit/page";
import { displayName } from "@/lib/auth/access";
import { requireSession } from "@/lib/auth/session";
import { getApprovals } from "@/lib/data/approvals/query";
import { requestTime } from "@/lib/data/scope";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
    const data = await getApprovals();
    if (data.open.length + data.grants.length + data.decisions.length === 0) {
        return (
            <div className={PAGE_LIST}>
                <PageHeading title="Approvals" />
                <EmptyLine>No approval requests yet</EmptyLine>
            </div>
        );
    }
    const [now, session] = await Promise.all([requestTime(), requireSession()]);

    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Approvals" />
            <div className="reveal grid min-w-0 grid-cols-1 gap-10 max-[760px]:gap-8">
                <ApprovalsBoard data={data} now={now} by={displayName(session)} />
            </div>
        </div>
    );
}

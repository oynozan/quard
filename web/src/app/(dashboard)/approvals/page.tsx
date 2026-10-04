import type { Metadata } from "next";
import { ApprovalsBoard } from "@/components/approvals/approvals-board";
import { linkedOf, shownOf } from "@/components/approvals/lib/shown";
import { PageHeading } from "@/components/kit/headings";
import { PAGE_LIST } from "@/components/kit/page";
import { displayName } from "@/lib/auth/access";
import { requireSession } from "@/lib/auth/session";
import { getApprovals } from "@/lib/data/approvals/query";
import { requestTime } from "@/lib/data/scope";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
    const params = await searchParams;
    const shown = shownOf(params);
    const linked = linkedOf(params);
    const [data, now, session] = await Promise.all([getApprovals(shown, linked), requestTime(), requireSession()]);

    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Approvals" />
            <div className="reveal grid min-w-0 grid-cols-1 gap-10 max-[760px]:gap-8">
                <ApprovalsBoard data={data} now={now} approver={displayName(session)} shown={shown} linked={linked} />
            </div>
        </div>
    );
}

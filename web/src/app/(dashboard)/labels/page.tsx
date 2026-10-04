import type { Metadata } from "next";
import { PageHeading } from "@/components/kit/headings";
import { PAGE_LIST } from "@/components/kit/page";
import { LabelStats } from "@/components/labels/label-stats";
import { ReviewQueue } from "@/components/labels/review-queue";
import { ReviewedTable } from "@/components/labels/reviewed-table";
import { getContentLabels } from "@/lib/data/content-labels/query";

export const metadata: Metadata = { title: "Labels" };

// The review queue for content labels: least sure chunks first, then the counts per label
export default async function LabelsPage() {
    const data = await getContentLabels();

    return (
        <div className={PAGE_LIST}>
            <PageHeading title="Labels" />
            <div className="reveal grid min-w-0 grid-cols-1 gap-10 max-[760px]:gap-8">
                <ReviewQueue queue={data.queue} open={data.open} now={data.now} />
                <LabelStats rows={data.stats} />
                <ReviewedTable rows={data.reviewed} now={data.now} />
            </div>
        </div>
    );
}

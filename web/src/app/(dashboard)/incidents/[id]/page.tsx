import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeading, SectionHeading } from "@/components/kit/headings";
import { RunStatusLabel } from "@/components/kit/labels";
import { buttonVariants } from "@/components/ui/button";
import { IncidentPath } from "@/components/incidents/detail/incident-path";
import { ReplayResults } from "@/components/incidents/detail/replay-results";
import { ReviewerNote } from "@/components/incidents/detail/reviewer-note";
import { VerdictBlock } from "@/components/incidents/detail/verdict";
import { getIncident } from "@/lib/data/incidents/query";
import { requestTime } from "@/lib/data/scope";
import { formatAge, formatLongDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PAGE_LIST } from "@/components/kit/page";

export async function generateMetadata({ params }: PageProps<"/incidents/[id]">) {
    const { id } = await params;
    const detail = await getIncident(id);
    return { title: detail ? detail.incident.title : "Incident not found" };
}

export default async function IncidentPage({ params }: PageProps<"/incidents/[id]">) {
    const { id } = await params;
    const detail = await getIncident(id);
    if (!detail) notFound();
    const { incident, verdict, path, replay, reviewer, run } = detail;
    const now = await requestTime();

    return (
        <div className={PAGE_LIST}>
            <Link
                href="/incidents"
                className="mb-[14px] inline-flex items-center gap-[6px] rounded-sm text-[13px] text-ink-link hover:text-ink-bright"
            >
                <ArrowLeft size={14} strokeWidth={0.75} aria-hidden />
                Incidents
            </Link>
            <PageHeading
                title={incident.title}
                actions={
                    <Link
                        href={`/runs/${incident.runId}`}
                        className={cn(buttonVariants({ variant: "outline" }), "h-[46px]")}
                    >
                        Open run
                    </Link>
                }
            />

            <p className="-mt-[14px] mb-[26px] flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
                <span title={formatLongDate(incident.openedAt)}>
                    Opened <span className="mono text-ink-2">{formatAge(incident.openedAt, now)}</span> ago
                </span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-2">
                    Run <RunStatusLabel status={run.status} />
                </span>
            </p>

            <div className="reveal">
                <IncidentPath path={path} />
            </div>

            <div
                className="reveal mt-[30px] grid grid-cols-[minmax(0,1fr)_400px] items-start gap-7 max-[1180px]:grid-cols-1 max-[760px]:mt-[25px] max-[760px]:gap-[25px]"
                style={{ animationDelay: "80ms" }}
            >
                <div className="grid min-w-0 gap-7 max-[1180px]:order-2 max-[760px]:gap-[25px]">
                    <section aria-label="Replay">
                        <SectionHeading title="Replay" />
                        <ReplayResults replay={replay} />
                    </section>
                    <ReviewerNote note={reviewer} />
                </div>
                <div className="min-w-0 max-[1180px]:order-1">
                    <VerdictBlock verdict={verdict} />
                </div>
            </div>
        </div>
    );
}

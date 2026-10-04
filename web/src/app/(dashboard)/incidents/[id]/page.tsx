import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AutoRefresh } from "@/components/kit/auto-refresh";
import { ErrorBox } from "@/components/kit/feedback/feedback";
import { PageHeading, SectionHeading } from "@/components/kit/headings";
import { RunStatusLabel, StatusSquare } from "@/components/kit/labels";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { IncidentPath } from "@/components/incidents/detail/incident-path";
import { MarkSeen } from "@/components/incidents/detail/mark-seen";
import { ReplayButton } from "@/components/incidents/detail/replay-button";
import { ReplayResults } from "@/components/incidents/detail/replay-results";
import { VerdictBlock } from "@/components/incidents/detail/verdict";
import { WORKER_DOWN } from "@/components/incidents/lib/labels";
import { getIncident } from "@/lib/data/incidents/query";
import type { IncidentFindings } from "@/lib/data/incidents/types";
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
    const { incident, run, findError, findings, working, workerRunning } = detail;
    const now = await requestTime();

    return (
        <div className={PAGE_LIST}>
            {working ? <AutoRefresh /> : null}
            {incident.seen ? null : <MarkSeen id={incident.id} />}
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
                    <>
                        <Link
                            href={`/runs/${incident.runId}`}
                            className={cn(buttonVariants({ variant: "outline" }), "h-[46px]")}
                        >
                            Open run
                        </Link>
                        <ReplayButton
                            id={incident.id}
                            status={incident.replay}
                            found={findings !== null}
                            findFailed={findError !== null}
                            workerRunning={workerRunning}
                        />
                    </>
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

            {findings ? (
                <Findings findings={findings} workerRunning={workerRunning} />
            ) : findError ? (
                <ErrorBox help="The run's own page still shows every step.">
                    The root-cause finder stopped: {findError}
                </ErrorBox>
            ) : workerRunning ? (
                <p role="status" className="inline-flex items-center gap-2 text-[13px] text-ink">
                    <Spinner />
                    Finding the entry point, the turning point and the damage…
                </p>
            ) : (
                <p role="status" className="inline-flex items-center gap-2 text-[13px] text-ink">
                    <StatusSquare tone="warning" />
                    {WORKER_DOWN}
                </p>
            )}
        </div>
    );
}

function Findings({ findings, workerRunning }: { findings: IncidentFindings; workerRunning: boolean }) {
    return (
        <>
            <div className="reveal">
                <IncidentPath path={findings.path} />
            </div>

            <div
                className="reveal mt-[30px] grid grid-cols-[minmax(0,1fr)_400px] items-start gap-7 max-[1180px]:grid-cols-1 max-[760px]:mt-[25px] max-[760px]:gap-[25px]"
                style={{ animationDelay: "80ms" }}
            >
                <section aria-label="Replay" className="min-w-0 max-[1180px]:order-2">
                    <SectionHeading title="Replay" />
                    <ReplayResults replay={findings.replay} workerRunning={workerRunning} />
                </section>
                <div className="min-w-0 max-[1180px]:order-1">
                    <VerdictBlock verdict={findings.verdict} />
                </div>
            </div>
        </>
    );
}

import { HeroChart } from "@/components/charts/hero-chart";
import { EmptyLine } from "@/components/kit/empty";
import { PAGE_WIDE } from "@/components/kit/page";
import { DecisionLog } from "@/components/overview/decision-log";
import { Greeting } from "@/components/overview/greeting";
import { ApprovalsSection, IncidentsSection, RunsSection } from "@/components/overview/overview-tables";
import { OverviewRail } from "@/components/overview/overview-rail";
import { TerminalOverview } from "@/components/overview/terminal-overview";
import { openApprovalCount, openApprovalRequests } from "@/lib/data/approvals";
import { getOverview } from "@/lib/data/overview";
import { greetingFor } from "@/lib/data/overview/greeting";
import { listRuns } from "@/lib/data/runs/query";
import { requestTime } from "@/lib/data/scope";

export default async function OverviewPage() {
    const now = await requestTime();
    const [data, approvals, waiting, runs] = await Promise.all([
        getOverview(now),
        openApprovalRequests(),
        openApprovalCount(),
        listRuns({ limit: 6 }),
    ]);

    if (!data) {
        return (
            <div className={PAGE_WIDE}>
                <Greeting text={greetingFor(now, 0)} className="mb-[18px]" />
                <EmptyLine>No activity yet</EmptyLine>
            </div>
        );
    }

    return (
        <div className={PAGE_WIDE}>
            <HeroChart greeting={data.greeting} values={data.activity.values} endsAt={data.activity.endsAt} />

            <TerminalOverview
                runsPerHour={data.runsPerHour}
                coverage={data.coverage}
                blockRate={data.blockRate}
                decisions24h={data.decisions24h}
            />

            <div className="mt-[30px] grid grid-cols-[minmax(0,1fr)_268px] items-start gap-7 max-[1180px]:grid-cols-[minmax(0,1fr)_232px] max-[1180px]:gap-[22px] max-[980px]:grid-cols-1 max-[760px]:mt-[25px]">
                <div
                    className="reveal grid min-w-0 grid-cols-1 gap-7 max-[760px]:gap-[25px]"
                    style={{ animationDelay: "80ms" }}
                >
                    <ApprovalsSection approvals={approvals} total={waiting} now={now} />
                    <RunsSection runs={runs} now={now} />
                    {/* Incidents have no source until their service exists */}
                    <IncidentsSection incidents={[]} now={now} />
                    <DecisionLog events={data.events} />
                </div>
                <OverviewRail agents={data.agents} guardCounts={data.guardCounts} />
            </div>
        </div>
    );
}

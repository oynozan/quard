import { HeroChart } from "@/components/charts/hero-chart";
import { EventLog } from "@/components/charts/event-log";
import { LiveMark } from "@/components/charts/chart-parts";
import { Pane } from "@/components/kit/pane";
import { ApprovalsSection, IncidentsSection, RunsSection } from "@/components/overview/overview-tables";
import { OverviewRail } from "@/components/overview/overview-rail";
import { TerminalOverview } from "@/components/overview/terminal-overview";
import { getOverview } from "@/lib/data/overview";
import { PAGE_WIDE } from "@/components/kit/page";

export default async function OverviewPage() {
    const data = await getOverview();

    return (
        <div className={PAGE_WIDE}>
            <HeroChart greeting={data.greeting} values={data.activity} endsAt={data.now} />

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
                    <ApprovalsSection approvals={data.approvals} now={data.now} />
                    <RunsSection runs={data.runs} now={data.now} />
                    <IncidentsSection incidents={data.incidents} now={data.now} />
                    <Pane title="Decision log" actions={<LiveMark />}>
                        <EventLog events={data.events} />
                    </Pane>
                </div>
                <OverviewRail agents={data.agents} guardCounts={data.guardCounts} />
            </div>
        </div>
    );
}

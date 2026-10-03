import type { AgentDetail } from "@/lib/data/agents";
import { CallTimeline } from "../timeline/call-timeline";
import { AgentHeading } from "./agent-heading";
import { AgentIncidents } from "./agent-incidents";
import { AgentPermissions } from "./agent-permissions";
import { AgentStats } from "./agent-stats";
import { CallsPerHour } from "./calls-per-hour";
import { VersionsTable } from "./versions-table";

// The agent page body: 24h numbers, its recent calls, versions and incidents, with permissions beside them
export function AgentView({ detail, now }: { detail: AgentDetail; now: number }) {
    const { agent } = detail;
    return (
        <>
            <AgentHeading agent={agent} now={now} />
            <AgentStats stats={detail.stats} />
            <div className="mt-7 grid grid-cols-[minmax(0,1fr)_360px] items-start gap-7 max-[1180px]:grid-cols-1 max-[760px]:mt-[25px] max-[760px]:gap-[25px]">
                <div className="grid min-w-0 grid-cols-1 gap-7 max-[760px]:gap-[25px]">
                    <CallTimeline name={agent.name} calls={detail.timeline} />
                    <VersionsTable versions={detail.versions} />
                    <AgentIncidents incidents={detail.incidents} versions={detail.versions} />
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-7 max-[1180px]:grid-cols-2 max-[980px]:grid-cols-1 max-[760px]:gap-[25px]">
                    <AgentPermissions name={agent.name} links={detail.links} />
                    <CallsPerHour name={agent.name} activity={detail.activity} />
                </div>
            </div>
        </>
    );
}

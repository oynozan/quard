import { CellColumns } from "@/components/charts/cell-columns";
import type { AgentDetail } from "@/lib/data/agents";
import { NOW } from "@/lib/data/rng";
import { formatClock, formatInt } from "@/lib/format";
import { HOUR } from "@/lib/time";
import { CallTimeline } from "../timeline/call-timeline";
import { AgentHeading } from "./agent-heading";
import { AgentIncidents } from "./agent-incidents";
import { AgentPermissions } from "./agent-permissions";
import { AgentStats } from "./agent-stats";
import { VersionsTable } from "./versions-table";

function noCalls(name: string): string {
    return `${name} made no model calls in the last 24 hours`;
}

function activitySummary(name: string, values: number[]): string {
    const peak = Math.max(0, ...values);
    if (peak === 0) return noCalls(name);
    const at = values.indexOf(peak);
    const latest = values[values.length - 1];
    return `Model calls by ${name} per hour over the last 24 hours. Peak ${formatInt(peak)} at ${formatClock(NOW - 24 * HOUR + at * HOUR)} UTC, latest ${formatInt(latest)}.`;
}

// The agent page body: 24h numbers, its recent calls, versions and incidents, with permissions beside them
export function AgentView({ detail }: { detail: AgentDetail }) {
    const { agent } = detail;
    return (
        <>
            <AgentHeading detail={detail} now={NOW} />
            <AgentStats stats={detail.stats} />
            <div className="mt-7 grid grid-cols-[minmax(0,1fr)_360px] items-start gap-7 max-[1180px]:grid-cols-1 max-[760px]:mt-[25px] max-[760px]:gap-[25px]">
                <div className="grid min-w-0 grid-cols-1 gap-7 max-[760px]:gap-[25px]">
                    <CallTimeline name={agent.name} calls={detail.timeline} />
                    <VersionsTable versions={detail.versions} />
                    <AgentIncidents incidents={detail.incidents} versions={detail.versions} />
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-7 max-[1180px]:grid-cols-2 max-[980px]:grid-cols-1 max-[760px]:gap-[25px]">
                    <AgentPermissions detail={detail} />
                    <CellColumns
                        title="Model calls per hour"
                        tag="24H"
                        values={detail.activity}
                        startAt={NOW - 24 * HOUR}
                        bucketMs={HOUR}
                        unit="calls"
                        unitOne="call"
                        rows={16}
                        emptyText={noCalls(agent.name)}
                        summary={activitySummary(agent.name, detail.activity)}
                        readouts={[
                            {
                                label: "Total",
                                value: formatInt(detail.activity.reduce((sum, value) => sum + value, 0)),
                            },
                        ]}
                    />
                </div>
            </div>
        </>
    );
}

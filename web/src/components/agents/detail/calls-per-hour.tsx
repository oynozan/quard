import { CellColumns } from "@/components/charts/cell-columns";
import type { AgentActivity } from "@/lib/data/agents";
import { formatClock, formatInt } from "@/lib/format";
import { HOUR } from "@/lib/time";

function summaryOf(name: string, { startAt, perHour }: AgentActivity): string {
    const peak = Math.max(...perHour);
    const at = startAt + perHour.indexOf(peak) * HOUR;
    const latest = perHour[perHour.length - 1];
    return `Model calls by ${name} per hour over the last 24 hours. Peak ${formatInt(peak)} at ${formatClock(at)} UTC, latest ${formatInt(latest)}.`;
}

// The agent's model calls per hour, with the empty field when it made none
export function CallsPerHour({ name, activity }: { name: string; activity: AgentActivity }) {
    const total = activity.perHour.reduce((sum, value) => sum + value, 0);
    return (
        <CellColumns
            title="Model calls per hour"
            tag="24H"
            values={activity.perHour}
            startAt={activity.startAt}
            bucketMs={HOUR}
            unit="calls"
            unitOne="call"
            rows={16}
            state={total ? "ready" : "empty"}
            emptyText="No model calls in the last 24 hours"
            summary={total ? summaryOf(name, activity) : `${name} made no model calls in the last 24 hours`}
            readouts={[{ label: "Total", value: formatInt(total) }]}
        />
    );
}

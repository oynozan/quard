import { CellColumns } from "@/components/charts/cell-columns";
import { EmptyLine } from "@/components/kit/empty";
import { Pane } from "@/components/kit/pane";
import type { AgentActivity } from "@/lib/data/agents";
import { formatClock, formatInt } from "@/lib/format";
import { HOUR } from "@/lib/time";

const TITLE = "Model calls per hour";

function summaryOf(name: string, { startAt, perHour }: AgentActivity): string {
    const peak = Math.max(...perHour);
    const at = startAt + perHour.indexOf(peak) * HOUR;
    const latest = perHour[perHour.length - 1];
    return `Model calls by ${name} per hour over the last 24 hours. Peak ${formatInt(peak)} at ${formatClock(at)} UTC, latest ${formatInt(latest)}.`;
}

// The agent's model calls per hour, drawn only when it made any
export function CallsPerHour({ name, activity }: { name: string; activity: AgentActivity }) {
    const total = activity.perHour.reduce((sum, value) => sum + value, 0);
    if (total === 0) {
        return (
            <Pane title={TITLE}>
                <EmptyLine inset>No model calls in the last 24 hours</EmptyLine>
            </Pane>
        );
    }
    return (
        <CellColumns
            title={TITLE}
            tag="24H"
            values={activity.perHour}
            startAt={activity.startAt}
            bucketMs={HOUR}
            unit="calls"
            unitOne="call"
            rows={16}
            summary={summaryOf(name, activity)}
            readouts={[{ label: "Total", value: formatInt(total) }]}
        />
    );
}

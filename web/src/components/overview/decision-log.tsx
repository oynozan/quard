import { LiveMark } from "@/components/charts/chart-parts";
import { EventLog } from "@/components/charts/event-log";
import { EmptyLine } from "@/components/kit/empty";
import { Pane } from "@/components/kit/pane";
import type { DecisionEvent } from "@/lib/data/types";

const TITLE = "Decision log";

// The latest guard decisions, live only while there is something to tail
export function DecisionLog({ events }: { events: DecisionEvent[] }) {
    if (events.length === 0) {
        return (
            <Pane title={TITLE}>
                <EmptyLine inset>No guard decisions in the last 24 hours</EmptyLine>
            </Pane>
        );
    }
    return (
        <Pane title={TITLE} actions={<LiveMark />}>
            <EventLog events={events} />
        </Pane>
    );
}

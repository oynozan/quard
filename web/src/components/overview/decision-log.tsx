import { EventLog } from "@/components/charts/event-log";
import { Pane } from "@/components/kit/pane";
import { LiveSign } from "@/components/live/live-sign";
import type { DecisionEvent } from "@/lib/data/types";

// The latest guard decisions of the last 24 hours
export function DecisionLog({ events }: { events: DecisionEvent[] }) {
    return (
        <Pane title="Decision log" actions={<LiveSign />}>
            <EventLog events={events} emptyText="No guard decisions in the last 24 hours" />
        </Pane>
    );
}

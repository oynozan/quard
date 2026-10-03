import type { DecisionEvent, RunEvent } from "@quard/shared";

export function decisionsOf(events: readonly RunEvent[]): DecisionEvent[] {
    return events.filter((event): event is DecisionEvent => event.type === "decision");
}

import { formatClock } from "@/lib/format";
import type { DecisionEvent, Outcome } from "@/lib/data/types";

const SQUARE: Record<Outcome, string> = {
    allow: "bg-chart-context",
    pass: "bg-chart-context",
    flag: "bg-warning",
    strip: "bg-warning",
    ask: "bg-warning",
    block: "bg-danger",
};

type EventLogProps = { events: DecisionEvent[]; live?: boolean; emptyText?: string };

// The latest guard decisions, tailed like terminal output
export function EventLog({ events, live = true, emptyText = "No guard decisions yet" }: EventLogProps) {
    return (
        <div className="mono overflow-x-auto px-3 py-[10px] text-[11px] leading-[20px]" aria-live="polite">
            {events.length > 0 ? (
                <ol className="min-w-[560px]">
                    {events.map((event) => (
                        <li
                            key={event.id}
                            className="grid grid-cols-[58px_12px_104px_96px_108px_1fr] items-center gap-x-2"
                        >
                            <span className="text-ink-muted">{formatClock(event.at, true)}</span>
                            <span aria-hidden className={`size-[6px] ${SQUARE[event.outcome]}`} />
                            <span className="text-ink">
                                {event.guard} {event.outcome}
                            </span>
                            <span className="truncate text-ink-2">{event.agent}</span>
                            <span className="truncate text-ink-muted">{event.tool}</span>
                            <span className="truncate text-ink-muted">{event.detail}</span>
                        </li>
                    ))}
                </ol>
            ) : (
                <p className="font-sans font-light text-ink-muted">{emptyText}</p>
            )}
            {live ? <span aria-hidden className="cursor-blink mt-1 block h-[10px] w-1 bg-signal" /> : null}
        </div>
    );
}

import { StatusSquare } from "@/components/kit/labels";
import type { Heartbeat } from "@/lib/data/approvals/types";
import { formatAge, formatClock } from "@/lib/format";

type Props = { heartbeat: Heartbeat; openedAt: number; now: number };

// One square and one line: how long the call waits, and whether its process is still alive.
export function RequestStatus({ heartbeat, openedAt, now }: Props) {
    const live = heartbeat.state === "live";
    const seconds = Math.max(1, Math.round((now - heartbeat.lastAt) / 1000));
    return (
        <span className="flex items-center gap-2 text-[12px] text-ink-2">
            <StatusSquare tone={live ? "warning" : "off"} />
            {live ? (
                <span>
                    Waiting <span className="mono">{formatAge(openedAt, now)}</span>
                    <span className="text-ink-muted">
                        {" · alive "}
                        <span className="mono">{seconds} s</span> ago
                    </span>
                </span>
            ) : (
                <span>
                    Stopped <span className="mono">{formatClock(heartbeat.lastAt)}</span> UTC
                    <span className="text-ink-muted">
                        {" · open "}
                        <span className="mono">{formatAge(openedAt, now)}</span>
                    </span>
                </span>
            )}
        </span>
    );
}

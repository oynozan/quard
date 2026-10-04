import { APPROVAL_STALE_MS } from "@quard/shared";
import { sql } from "kysely";

// The waiter `w` still waits: it is not done and beat inside the stale limit.
// The dashboard shows the same rule as "no longer waiting".
export const STILL_WAITS = sql<boolean>`w.done_at IS NULL
    AND w.last_beat_at >= now() - make_interval(secs => ${APPROVAL_STALE_MS / 1000})`;

// A call still waits on the request row `approval_requests`
export const REQUEST_LIVE = sql<boolean>`EXISTS (
    SELECT 1 FROM approval_waiters w
    WHERE w.project_id = approval_requests.project_id AND w.request_id = approval_requests.id AND ${STILL_WAITS}
)`;

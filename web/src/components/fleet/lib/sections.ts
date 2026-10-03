import type { RunLimitCount } from "@/lib/data/fleet";

// Observe-mode limits count the runs they would stop, block-mode limits the runs they stopped
export function limitCount(limit: RunLimitCount): number {
    return limit.mode === "observe" ? limit.wouldStop : limit.stopped;
}

import type { BlocksByGuard, FleetData, RunLimitCount } from "@/lib/data/fleet";
import { sum } from "./charts";

// Observe-mode limits count the runs they would stop, block-mode limits the runs they stopped
export function limitCount(limit: RunLimitCount): number {
    return limit.mode === "observe" ? limit.wouldStop : limit.stopped;
}

export function hasIncidents(fleet: Pick<FleetData, "incidentsBySource" | "incidentsByTool">): boolean {
    const counts = [...fleet.incidentsBySource, ...fleet.incidentsByTool].map((row) => row.count);
    return sum(counts) > 0;
}

export function hasBlocks(byGuard: BlocksByGuard): boolean {
    return sum(byGuard.totals) > 0;
}

export function hasAgentLinks(fleet: Pick<FleetData, "agentPoints" | "untrustedLinks">): boolean {
    return fleet.untrustedLinks.length > 0 || fleet.agentPoints.some((row) => row.entry > 0 || row.turning > 0);
}

export function hasLimitHits(limits: RunLimitCount[]): boolean {
    return sum(limits.map(limitCount)) > 0;
}

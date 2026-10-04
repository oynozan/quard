import { agentLinks, guardBlockHours, incidentCounts } from "@quard/db";
import { projectScope } from "../scope";
import { blocksOf, windowStart } from "./blocks";
import { untrustedLinksOf } from "./links";
import type { FleetData } from "./types";

const NO_INCIDENTS = { bySource: [], byTool: [], agentPoints: [] };

// What goes wrong across every agent over the last 30 UTC days
export async function getFleet(): Promise<FleetData> {
    const scope = await projectScope();
    const endAt = Date.now();
    const startAt = windowStart(endAt);
    const since = new Date(startAt);
    const [hours, links, incidents] = scope
        ? await Promise.all([
              guardBlockHours(scope.db, scope.project.id, { since, until: new Date(endAt) }),
              agentLinks(scope.db, scope.project.id, { since }),
              incidentCounts(scope.db, scope.project.id, since),
          ])
        : [[], [], NO_INCIDENTS];
    const { byGuard, heatmap } = blocksOf(hours, startAt);
    return {
        startAt,
        endAt,
        incidentsBySource: incidents.bySource,
        incidentsByTool: incidents.byTool,
        blocksByGuard: byGuard,
        blocksHeatmap: heatmap,
        agentPoints: incidents.agentPoints,
        untrustedLinks: untrustedLinksOf(links),
        // Run limits have no source yet; the quarantine is read on its own
        runLimits: [],
    };
}

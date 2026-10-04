import { agentLinks, guardBlockHours, incidentCounts, runLimitCounts } from "@quard/db";
import { projectScope } from "../scope";
import { blocksOf, windowStart } from "./blocks";
import { runLimitsOf } from "./limits";
import { untrustedLinksOf } from "./links";
import type { FleetData } from "./types";

const NO_INCIDENTS = { bySource: [], byTool: [], agentPoints: [] };

// What goes wrong across every agent over the last 30 UTC days
export async function getFleet(): Promise<FleetData> {
    const scope = await projectScope();
    const endAt = Date.now();
    const startAt = windowStart(endAt);
    const since = new Date(startAt);
    const range = { since, until: new Date(endAt) };
    const [hours, links, incidents, limits] = scope
        ? await Promise.all([
              guardBlockHours(scope.db, scope.project.id, range),
              agentLinks(scope.db, scope.project.id, { since }),
              incidentCounts(scope.db, scope.project.id, since),
              runLimitCounts(scope.db, scope.project.id, range),
          ])
        : [[], [], NO_INCIDENTS, []];
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
        runLimits: runLimitsOf(limits),
    };
}

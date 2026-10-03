import { agentLinks, guardBlockHours } from "@quard/db";
import { projectScope } from "../scope";
import { blocksOf, windowStart } from "./blocks";
import { untrustedLinksOf } from "./links";
import type { FleetData } from "./types";

// What goes wrong across every agent over the last 30 UTC days
export async function getFleet(): Promise<FleetData> {
    const scope = await projectScope();
    const endAt = Date.now();
    const startAt = windowStart(endAt);
    const since = new Date(startAt);
    const [hours, links] = scope
        ? await Promise.all([
              guardBlockHours(scope.db, scope.project.id, { since, until: new Date(endAt) }),
              agentLinks(scope.db, scope.project.id, { since }),
          ])
        : [[], []];
    const { byGuard, heatmap } = blocksOf(hours, startAt);
    return {
        startAt,
        endAt,
        // Incidents and run limits have no source yet; the quarantine is read on its own
        incidentsBySource: [],
        incidentsByTool: [],
        blocksByGuard: byGuard,
        blocksHeatmap: heatmap,
        agentPoints: [],
        untrustedLinks: untrustedLinksOf(links),
        runLimits: [],
    };
}

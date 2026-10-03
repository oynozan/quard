import { agentEdges, incidentRoles } from "../agents/graph";
import { agentNames } from "../agents/roster";
import { RUN_LIMITS, type LimitName } from "../guards/limits";
import { incidentDetail } from "../incidents/query";
import { allIncidents } from "../incidents/list";
import { NOW } from "../rng";
import { catalogRuns } from "../runs/catalog";
import { quarantined, watched } from "./quarantine";
import { blockSeries } from "./series";
import type { FleetData, QuarantinedValue, RunLimitCount } from "./types";

// Runs over a limit in the last 30 days. Observe-mode limits only record "would stop".
const LIMIT_HITS: Record<LimitName, number> = { depth: 7, "fan-out": 2, loops: 4, steps: 11, cost: 5 };

function runLimitCounts(): RunLimitCount[] {
    return RUN_LIMITS.map((limit) => ({
        name: limit.name,
        limit: limit.limit,
        unit: limit.unit,
        mode: limit.mode,
        wouldStop: limit.mode === "observe" ? LIMIT_HITS[limit.name] : 0,
        stopped: limit.mode === "block" ? LIMIT_HITS[limit.name] : 0,
    }));
}

// Quarantine blocks inside the listed runs count on top of older attempts.
function withRecentAttempts(rows: QuarantinedValue[]): QuarantinedValue[] {
    return rows.map((row) => {
        const hits = catalogRuns().flatMap((run) =>
            run.detail.steps.filter(
                (step) =>
                    step.guard?.rule === "fleet-check" &&
                    step.guard.reason.startsWith(`${row.value} is on the quarantine`),
            ),
        );
        if (!hits.length) return row;
        return {
            ...row,
            blockedAttempts: row.blockedAttempts + hits.length,
            lastAttemptAt: Math.max(row.lastAttemptAt, ...hits.map((step) => step.startedAt)),
        };
    });
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
    const groups = new Map<string, T[]>();
    for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
    return groups;
}

// Everything the fleet view shows, over the last 30 days.
export async function getFleet(): Promise<FleetData> {
    const details = allIncidents().flatMap((incident) => {
        const detail = incidentDetail(incident.id);
        return detail ? [detail] : [];
    });
    const bySource = countBy(details, (detail) => detail.verdict.entryPoint.label.origin);
    const byTool = countBy(details, (detail) => detail.verdict.damage.title);
    const roles = incidentRoles();
    const { byGuard, heatmap } = blockSeries();

    return {
        windowDays: 30,
        startAt: byGuard.startAt,
        endAt: NOW,
        incidentsBySource: [...bySource.entries()]
            .map(([origin, group]) => ({ origin, label: group[0].verdict.entryPoint.label, count: group.length }))
            .sort((a, b) => b.count - a.count || a.origin.localeCompare(b.origin)),
        incidentsByTool: [...byTool.entries()]
            .map(([tool, group]) => ({ tool, count: group.length }))
            .sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool)),
        blocksByGuard: byGuard,
        blocksHeatmap: heatmap,
        agentPoints: agentNames()
            .map((agent) => ({
                agent,
                entry: roles.filter((role) => role.entry === agent).length,
                turning: roles.filter((role) => role.turning === agent).length,
                damage: roles.filter((role) => role.damage === agent).length,
            }))
            .sort((a, b) => b.entry + b.turning - (a.entry + a.turning)),
        untrustedLinks: agentEdges()
            .filter((edge) => edge.untrusted > 0)
            .sort((a, b) => b.untrusted - a.untrusted)
            .slice(0, 6)
            .map(({ from, to, total, untrusted, untrustedShare }) => ({ from, to, total, untrusted, untrustedShare })),
        runLimits: runLimitCounts(),
        quarantine: withRecentAttempts(quarantined()),
        watching: watched(),
        fleetCheck: {
            fields: ["iban", "to", "url"],
            newForDays: 7,
            runsToBlock: 5,
            withinHours: 24,
            // The check's first 7 days in observe mode ended long ago.
            observeUntil: null,
        },
    };
}

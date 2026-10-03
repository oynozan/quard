import type { DecisionRow } from "@quard/db";
import type { DecisionEvent, DecisionGuard, Outcome } from "../types";

const GUARDS: ReadonlySet<string> = new Set<DecisionGuard>([
    "source",
    "action",
    "approval",
    "egress",
    "limit",
    "permission",
    "signature",
]);

type KnownRow = DecisionRow & { guard: DecisionGuard };

const known = (row: DecisionRow): row is KnownRow => GUARDS.has(row.guard);

// The reason as the run timeline words it
function reasonText(row: DecisionRow): string {
    return row.reason ? row.reason.replaceAll(",", ", ").replaceAll("_", " ") : row.decision;
}

// An observe row shows what happened, then what the rule would have done
function lineOf(row: KnownRow): DecisionEvent {
    const decision = row.decision as Outcome;
    const observed = row.mode === "observe";
    const would = observed && decision !== "allow" && decision !== "pass";
    return {
        id: row.eventId,
        at: row.at.getTime(),
        agent: row.agent,
        tool: row.tool,
        guard: row.guard,
        outcome: observed ? (row.guard === "source" ? "pass" : "allow") : decision,
        runId: row.runId,
        detail: would ? `would ${decision} · ${reasonText(row)}` : reasonText(row),
    };
}

// Newest-first rows as oldest-first log lines, without guards the dashboard does not know
export function decisionLog(rows: DecisionRow[]): DecisionEvent[] {
    return rows.filter(known).map(lineOf).reverse();
}

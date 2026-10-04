import type { IncidentRow, StoredVerdict, VerdictEntry } from "@quard/db";
import { nodeOf, originNode, originTitle } from "../../approvals/live/influence";
import type { RunDetail } from "../../runs/types";
import type { PathNode, PathRole } from "../../types";
import type { IncidentDetail, IncidentFindings } from "../types";
import { incidentOf } from "./incident";
import { replayOf } from "./replay";

// Where the content came in: the entry's own step, else one with its origin, else the stored entry
function entryNode(run: RunDetail, entry: VerdictEntry): PathNode {
    const node = originNode(run, entry.origin, entry.stepId) ?? {
        kind: "origin",
        role: null,
        title: originTitle(entry.origin),
        detail: entry.flags.join(", "),
        agent: entry.agent,
        runId: run.summary.id,
        stepId: entry.stepId,
        label: { origin: entry.origin, trust: entry.trust, sensitivity: entry.sensitivity },
        at: Date.parse(entry.at),
    };
    return { ...node, role: "entry" };
}

// Entry point, turning point and damage. A step the run does not hold is left out.
export function incidentPath(run: RunDetail, verdict: StoredVerdict): PathNode[] {
    const marked = (stepId: string, role: PathRole): PathNode[] => {
        const step = run.steps.find((item) => item.id === stepId);
        return step ? [{ ...nodeOf(run, step), role }] : [];
    };
    return [
        entryNode(run, verdict.entry),
        ...marked(verdict.turning.stepId, "turning"),
        ...marked(verdict.damage.stepId, "damage"),
    ];
}

function findingsOf(row: IncidentRow, verdict: StoredVerdict, run: RunDetail): IncidentFindings {
    return {
        // Handoff faults need messages between agents (M4)
        verdict: {
            category: verdict.category,
            missingGuard: verdict.missingGuard,
            handoffFault: null,
            versions: verdict.versions,
        },
        path: incidentPath(run, verdict),
        replay: replayOf(row, verdict, run),
    };
}

// One incident with its run. Without a verdict yet, only the incident and its run.
export function incidentDetailOf(row: IncidentRow, run: RunDetail, workerRunning: boolean): IncidentDetail {
    const incident = incidentOf(row);
    return {
        incident,
        run: run.summary,
        findError: row.findError,
        findings: row.verdict ? findingsOf(row, row.verdict, run) : null,
        working: row.findState === "pending" || incident.replay === "queued" || incident.replay === "running",
        workerRunning,
    };
}

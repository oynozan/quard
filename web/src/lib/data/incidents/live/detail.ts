import type { IncidentRow, StoredVerdict, VerdictEntry } from "@quard/db";
import { nodeOf, originNode, originTitle } from "../../approvals/live/influence";
import type { RunDetail } from "../../runs/types";
import type { PathNode, PathRole } from "../../types";
import type { IncidentDetail, IncidentFindings, VerdictHandoff } from "../types";
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

// The message or handoff that carried the content to another agent
function carryNode(run: RunDetail, handoff: VerdictHandoff): PathNode {
    return {
        kind: handoff.kind === "handoff" ? "handoff" : "message",
        role: "carry",
        title: `${handoff.from} to ${handoff.to}`,
        detail: handoff.verified ? "Verified: its label record matched" : "Not verified: no label record matched",
        agent: handoff.from,
        runId: run.summary.id,
        stepId: handoff.stepId,
        // The verdict keeps only its trust
        label: { origin: `agent:${handoff.from}`, trust: handoff.trust, sensitivity: "internal" },
        at: Date.parse(handoff.at),
    };
}

// Entry point, any handoff across agents, turning point and damage.
// A step the run does not hold is left out.
export function incidentPath(run: RunDetail, verdict: StoredVerdict): PathNode[] {
    const marked = (stepId: string, role: PathRole): PathNode[] => {
        const step = run.steps.find((item) => item.id === stepId);
        return step ? [{ ...nodeOf(run, step), role }] : [];
    };
    // Verdicts stored before M4 have no acrossAgents
    const handoff = verdict.acrossAgents?.handoff;
    return [
        entryNode(run, verdict.entry),
        ...(handoff ? [carryNode(run, handoff)] : []),
        ...marked(verdict.turning.stepId, "turning"),
        ...marked(verdict.damage.stepId, "damage"),
    ];
}

// The AI reviewer's note, or why there is none
function reviewerOf(row: IncidentRow): Pick<IncidentFindings, "reviewer" | "reviewerStatus"> {
    const stored = row.reviewer;
    if (stored && "paragraphs" in stored) {
        const { model, costUsd, paragraphs } = stored;
        return {
            reviewer: { model, costUsd, paragraphs, writtenAt: Date.parse(stored.writtenAt) },
            reviewerStatus: "",
        };
    }
    if (stored) return { reviewer: null, reviewerStatus: `The explanation failed: ${stored.error}` };
    const skipped = row.reviewState === "skipped";
    return {
        reviewer: null,
        reviewerStatus: skipped ? "Skipped: the worker has no provider key" : "No explanation yet",
    };
}

function findingsOf(row: IncidentRow, verdict: StoredVerdict, run: RunDetail): IncidentFindings {
    return {
        // Verdicts stored before M4 lack the last two fields
        verdict: {
            category: verdict.category,
            missingGuard: verdict.missingGuard,
            versions: verdict.versions,
            handoffFault: verdict.handoffFault ?? null,
            acrossAgents: verdict.acrossAgents ?? null,
        },
        path: incidentPath(run, verdict),
        replay: replayOf(row, verdict, run),
        ...reviewerOf(row),
    };
}

// One incident with its run. Without a verdict yet, only the incident and its run.
export function incidentDetailOf(row: IncidentRow, run: RunDetail): IncidentDetail {
    const incident = incidentOf(row);
    const { findState, reviewState } = row;
    return {
        incident,
        run: run.summary,
        findError: row.findError,
        findings: row.verdict ? findingsOf(row, row.verdict, run) : null,
        // The note is written only after a verdict
        working:
            findState === "pending" ||
            (findState === "done" && reviewState === "pending") ||
            incident.replay === "running",
    };
}

import { incidentPath, nodeOf } from "../paths/build";
import { catalogRun } from "../runs/catalog";
import { allIncidents } from "./list";
import { buildReplay, reviewerNote } from "./replay";
import { REVIEWS } from "./reviews";
import { INCIDENT_SPECS } from "./specs";
import type { RunDetail, Step } from "../runs/types";
import type { Incident, PathRole } from "../types";
import type { AcrossAgents, IncidentDetail, VerdictPoint } from "./types";

function point(run: RunDetail, step: Step, role: PathRole): VerdictPoint {
    const node = nodeOf(run, step, role, role === "entry");
    return {
        stepId: step.id,
        agent: step.agent,
        title: node.title,
        detail: node.detail,
        label: node.label,
        at: step.startedAt,
    };
}

// The verdict, path, replay and AI explanation for one incident. Sync, for other data modules.
export function incidentDetail(id: string): IncidentDetail | null {
    const incident = allIncidents().find((item) => item.id === id);
    const spec = INCIDENT_SPECS[id];
    const run = incident ? catalogRun(incident.runId) : null;
    if (!incident || !spec || !run) return null;
    const marked = (role: PathRole) => {
        const mark = run.built.marks.find((item) => item.role === role);
        return run.detail.steps.find((step) => step.id === mark?.stepId);
    };
    const entry = marked("entry");
    const turning = marked("turning");
    const damage = marked("damage");
    const carry = marked("carry");
    if (!entry || !turning || !damage) return null;

    const involved = new Set([entry.agent, carry?.link?.to ?? entry.agent, turning.agent, damage.agent]);
    const across: AcrossAgents | null =
        involved.size > 1
            ? {
                  entryAgent: entry.agent,
                  handoff: carry?.link
                      ? { stepId: carry.id, from: carry.link.from, to: carry.link.to, summary: carry.link.summary }
                      : null,
                  turningAgent: turning.agent,
                  damageAgent: damage.agent,
              }
            : null;
    const reviewer = REVIEWS[id] ? reviewerNote(id, incident.openedAt, REVIEWS[id]) : null;
    return {
        incident,
        verdict: {
            category: incident.category,
            entryPoint: point(run.detail, entry, "entry"),
            turningPoint: point(run.detail, turning, "turning"),
            damage: point(run.detail, damage, "damage"),
            missingGuard: spec.missingGuard,
            acrossAgents: across,
            handoffFault: spec.handoffFault,
            versions: run.detail.agents
                .filter((agent) => involved.has(agent.name))
                .map((agent) => ({ agent: agent.name, version: agent.version })),
        },
        path: incidentPath(run.detail, run.built.marks),
        replay: buildReplay(spec, turning, incident.openedAt, reviewer?.costUsd ?? 0),
        reviewer,
        run: run.detail.summary,
    };
}

// Every incident, newest first.
export async function listIncidents(): Promise<Incident[]> {
    return allIncidents();
}

export async function getIncident(id: string): Promise<IncidentDetail | null> {
    return incidentDetail(id);
}

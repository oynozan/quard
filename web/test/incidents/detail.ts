import type { IncidentDetail, VerdictPoint } from "@/lib/data/incidents/types";
import type { Label, PathNode, PathRole } from "@/lib/data/types";
import { replayOf } from "../incidents-search/replay";
import { MINUTE, SECOND } from "../time";
import { INCIDENTS } from "./list";

const INCIDENT = INCIDENTS[0]!;
const START = INCIDENT.openedAt - 2 * MINUTE;

const PAGE: Label = { origin: "web:supplier-portal.example", trust: "untrusted", sensitivity: "public" };
const NOTE: Label = { origin: "agent:researcher", trust: "untrusted", sensitivity: "internal" };

function point(stepId: string, agent: string, title: string, label: Label, at: number): VerdictPoint {
    return { stepId, agent, title, detail: "", label, at };
}

function node(kind: PathNode["kind"], role: PathRole | null, title: string, label: Label, at: number): PathNode {
    return { kind, role, title, detail: "", agent: null, runId: INCIDENT.runId, stepId: null, label, at };
}

// The payment incident with a confirmed replay and the AI reviewer's note
export const INCIDENT_DETAIL: IncidentDetail = {
    incident: INCIDENT,
    verdict: {
        category: "bad input",
        entryPoint: point("s2", "researcher", "supplier-portal.example", PAGE, START + 5 * SECOND),
        turningPoint: point("s9", "billing", "billing", NOTE, START + 40 * SECOND),
        damage: point("s11", "billing", "pay_invoice", NOTE, START + 55 * SECOND),
        missingGuard: "pay_invoice.iban-source runs in observe mode, so nothing enforces where the IBAN comes from",
        acrossAgents: {
            entryAgent: "researcher",
            handoff: { stepId: "s6", from: "researcher", to: "billing", summary: "Supplier details for INV-20931" },
            turningAgent: "billing",
            damageAgent: "billing",
        },
        handoffFault: null,
        versions: [
            { agent: "researcher", version: "v5" },
            { agent: "billing", version: "v12" },
        ],
    },
    path: [
        node("origin", "entry", "supplier-portal.example", PAGE, START + 5 * SECOND),
        node("handoff", "carry", "researcher to billing", NOTE, START + 30 * SECOND),
        node("agent", "turning", "billing", NOTE, START + 40 * SECOND),
        node("call", "damage", "pay_invoice", NOTE, START + 55 * SECOND),
    ],
    replay: replayOf([[5, 0, 0.004]], [0.05], { status: "confirmed" }),
    reviewer: {
        model: "gpt-6.1-sol",
        costUsd: 0.0123,
        writtenAt: INCIDENT.openedAt + MINUTE,
        paragraphs: ["The researcher copied an IBAN from a supplier page, and billing paid it."],
    },
    run: {
        id: INCIDENT.runId,
        rootAgent: "researcher",
        agents: ["researcher", "billing"],
        status: "blocked",
        startedAt: START,
        durationMs: 90 * SECOND,
        steps: 12,
        costUsd: 0.04,
        decisions: { allowed: 6, asked: 1, blocked: 1 },
        untrusted: true,
        tools: ["fetch_page", "pay_invoice"],
        incidentId: INCIDENT.id,
        approvalId: null,
    },
};

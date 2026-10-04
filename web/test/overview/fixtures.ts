import type { OverviewData } from "@/lib/data/overview";
import type { RunRow } from "@/lib/data/runs/types";
import type { Agent, ApprovalRequest, DecisionEvent, Incident, Label } from "@/lib/data/types";
import { MINUTE, NOW } from "../time";

const SUPPLIER: Label = { origin: "web:supplier-portal.example", trust: "untrusted", sensitivity: "public" };
const USER: Label = { origin: "user", trust: "trusted", sensitivity: "internal" };

// The hero's window ends at the round 10 minutes after NOW
export const HERO_END = Date.UTC(2026, 9, 3, 18, 50);
export const RATE_START = Date.UTC(2026, 8, 4);

export const APPROVALS: ApprovalRequest[] = [
    {
        id: "apr_7f31",
        runId: "4bf92f3577b34da6a3ce929d0e0e4736",
        stepId: "b7ad6b7169203331",
        agent: "billing",
        tool: "pay_invoice",
        args: [
            { name: "iban", value: "DE89…3000", origins: [USER, SUPPLIER] },
            { name: "amount", value: "4,950 EUR", origins: [], traced: false },
        ],
        reason: "Payments need a human",
        openedAt: NOW - 4 * MINUTE,
        waiting: true,
    },
    {
        id: "apr_7f0a",
        runId: "9c1e4d2b77a04f6e8a1b2c3d4e5f6a7b",
        stepId: "c8be7c8270314442",
        agent: "deploy-bot",
        tool: "deploy",
        args: [{ name: "env", value: "production", origins: [USER] }],
        reason: "Deploys need a human",
        openedAt: NOW - 30 * MINUTE,
        waiting: false,
    },
];

export const INCIDENTS: Incident[] = [
    {
        id: "inc_118",
        runId: "4bf92f3577b34da6a3ce929d0e0e4736",
        title: "Payment to an IBAN copied from a supplier page",
        category: "bad input",
        entryPoint: "fetch_page · supplier-portal.example",
        damage: "pay_invoice",
        entryAgent: "researcher",
        damageAgent: "billing",
        replay: "running",
        openedAt: NOW - 3 * MINUTE,
    },
    {
        id: "inc_117",
        runId: "9c1e4d2b77a04f6e8a1b2c3d4e5f6a7b",
        title: "Deploy without a review",
        category: "missing guard",
        entryPoint: "deploy",
        damage: "deploy",
        entryAgent: "deploy-bot",
        damageAgent: "deploy-bot",
        replay: "confirmed",
        openedAt: NOW - 2 * 60 * MINUTE,
    },
];

// A run as listRuns returns it, with the fields a test sets
export function runRow(fields: Partial<RunRow> = {}): RunRow {
    return {
        id: "64da1210aa0b4c1d9e8f7a6b5c4d3e2f",
        rootAgent: "orchestrator",
        agents: ["orchestrator", "researcher"],
        status: "running",
        startedAt: NOW - MINUTE,
        durationMs: MINUTE,
        steps: 14,
        costUsd: 0.03,
        costKnown: true,
        decisions: { allowed: 5, asked: 0, blocked: 1 },
        untrusted: false,
        tools: ["fetch_page"],
        incidentId: null,
        approvalId: null,
        ...fields,
    };
}

export const AGENTS: Agent[] = [
    { name: "billing", state: "running", model: "gpt-5.4-mini" },
    { name: "researcher", state: "running", model: "o4-mini" },
    { name: "support", state: "idle", model: null },
];

let next = 0;

// One decision log line, with the fields a test sets
export function logLine(fields: Partial<DecisionEvent> = {}): DecisionEvent {
    next += 1;
    return {
        id: next.toString(16).padStart(16, "e"),
        at: NOW - MINUTE,
        agent: "billing",
        tool: "pay_invoice",
        guard: "action",
        outcome: "block",
        runId: "4bf92f3577b34da6a3ce929d0e0e4736",
        detail: "value not from allowed origin",
        ...fields,
    };
}

// A busy project, with the parts a test sets
export function overview(fields: Partial<OverviewData> = {}): OverviewData {
    return {
        greeting: "Good evening. 2 agents are running.",
        activity: { values: Array.from({ length: 144 }, (_, i) => (i === 143 ? 3 : 10)), endsAt: HERO_END },
        runsPerHour: Array.from({ length: 24 }, (_, i) => (i === 23 ? 6 : 40)),
        coverage: { guarded: 18, seen: 21 },
        blockRate: {
            values: Array.from({ length: 30 }, (_, i) => (i === 29 ? 0.5 : 1)),
            limit: 2,
            startAt: RATE_START,
        },
        decisions24h: { blocked: 5, asked: 10 },
        events: [logLine({ at: NOW - 2 * MINUTE, outcome: "ask", guard: "approval" }), logLine()],
        agents: AGENTS,
        guardCounts: [
            { type: "source", count: 2140 },
            { type: "approval", count: 41 },
        ],
        ...fields,
    };
}

const zeros = (length: number) => Array<number>(length).fill(0);

// A project whose runs are all older than every window, as getOverview gives it
export const QUIET: OverviewData = {
    greeting: "Good evening. No agents are running.",
    activity: { values: zeros(144), endsAt: HERO_END },
    runsPerHour: zeros(24),
    coverage: { guarded: 0, seen: 0 },
    blockRate: { values: [], limit: 2, startAt: RATE_START },
    decisions24h: { blocked: 0, asked: 0 },
    events: [],
    agents: [],
    guardCounts: ["source", "action", "egress", "limit", "approval", "permission", "signature"].map((type) => ({
        type,
        count: 0,
    })),
};

// A new install, before any project or run
export const NEW_INSTALL: OverviewData = { ...QUIET, greeting: "Good evening." };

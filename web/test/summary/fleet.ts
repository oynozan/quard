import type {
    BlocksByGuard,
    BlocksHeatmap,
    FleetData,
    QuarantinedValue,
    RunLimitCount,
    WatchedValue,
} from "@/lib/data/fleet";
import type { GuardType } from "@/lib/data/types";
import { DAY, HOUR, MINUTE, NOW } from "../time";

// UTC midnight 29 days before NOW, where a summary read at NOW starts
export const START_AT = Date.UTC(2026, 8, 4);

const GUARDS: GuardType[] = ["source", "action", "egress", "limit", "approval", "permission"];

const zeros = (length: number): number[] => Array.from({ length }, () => 0);

// A 7 by 24 grid with blocks in the given weekday, hour and count cells
export function heatmapOf(cells: [number, number, number][]): BlocksHeatmap {
    const values = Array.from({ length: 7 }, () => zeros(24));
    for (const [day, hour, blocks] of cells) values[day][hour] += blocks;
    const hourTotals = zeros(24).map((_, hour) => values.reduce((sum, row) => sum + row[hour], 0));
    return { values, hourTotals, total: hourTotals.reduce((sum, value) => sum + value, 0) };
}

// A project with nothing to summarize, with fields swapped as a test needs
export function emptyFleet(changes: Partial<FleetData> = {}): FleetData {
    return {
        startAt: START_AT,
        endAt: NOW,
        incidentsBySource: [],
        incidentsByTool: [],
        blocksByGuard: {
            startAt: START_AT,
            series: GUARDS.map((guard) => ({ guard, values: zeros(30), total: 0 })),
            totals: zeros(30),
        },
        blocksHeatmap: heatmapOf([]),
        agentPoints: [],
        untrustedLinks: [],
        runLimits: [],
        quarantine: [],
        watching: [],
        ...changes,
    };
}

// The window's last three days, Thursday to today, with blocks from two guards
export const BY_GUARD: BlocksByGuard = {
    startAt: START_AT + 27 * DAY,
    series: [
        { guard: "source", values: [4, 0, 2], total: 6 },
        { guard: "action", values: [0, 0, 0], total: 0 },
        { guard: "egress", values: [1, 1200, 3], total: 1204 },
    ],
    totals: [5, 1200, 5],
};

// The same blocks by UTC weekday and hour, busiest on Friday at 14:00
export const HEATMAP = heatmapOf([
    [3, 9, 5],
    [4, 14, 1200],
    [5, 8, 5],
]);

const web = { origin: "web page", trust: "untrusted", sensitivity: "public" } as const;

export const SOURCES: FleetData["incidentsBySource"] = [
    { origin: "web page", label: web, count: 1200 },
    { origin: "user", label: { origin: "user", trust: "trusted", sensitivity: "internal" }, count: 2 },
    { origin: "email", label: { ...web, origin: "email" }, count: 3 },
];

export const TOOLS: FleetData["incidentsByTool"] = [{ tool: "send_payment", count: 1205 }];

export const POINTS: FleetData["agentPoints"] = [
    { agent: "support", entry: 2, turning: 0 },
    { agent: "billing", entry: 2, turning: 1 },
    { agent: "researcher", entry: 5, turning: 0 },
    { agent: "planner", entry: 0, turning: 0 },
];

export const LINKS: FleetData["untrustedLinks"] = [
    { from: "researcher", to: "billing", delegations: 2400, untrusted: 1200, untrustedShare: 0.5 },
    { from: "support", to: "billing", delegations: 40, untrusted: 3, untrustedShare: 0.075 },
];

// Observe-mode limits count what they would stop, the block-mode loop limit what it stopped
export const LIMITS: RunLimitCount[] = [
    { name: "depth", limit: 3, unit: "levels", mode: "observe", wouldStop: 3, stopped: 0 },
    { name: "fan-out", limit: 10, unit: "helpers per agent", mode: "observe", wouldStop: 1, stopped: 0 },
    { name: "loops", limit: 5, unit: "handoffs back and forth", mode: "block", wouldStop: 0, stopped: 2 },
    { name: "steps", limit: 200, unit: "model calls", mode: "observe", wouldStop: 6, stopped: 0 },
    { name: "cost", limit: 5, unit: "USD", mode: "observe", wouldStop: 0, stopped: 0 },
];

export const QUARANTINE: QuarantinedValue[] = [
    {
        kind: "iban",
        field: "iban",
        value: "LT12…1000",
        hash: "3f9a07c2d1e4",
        firstSeenAt: NOW - 4 * DAY - 4 * HOUR,
        quarantinedAt: NOW - 4 * DAY - 3 * HOUR,
        runs: 5,
        blockedAttempts: 9,
        agents: ["billing"],
        lastAttemptAt: NOW - 2 * HOUR - 41 * MINUTE,
    },
    {
        kind: "domain",
        field: "url",
        value: "acme-billing.net",
        hash: "8b10e45f7a3e",
        firstSeenAt: NOW - 4 * DAY - 5 * HOUR,
        quarantinedAt: NOW - 4 * DAY - 2 * HOUR,
        runs: 5,
        blockedAttempts: 3,
        agents: ["researcher"],
        lastAttemptAt: NOW - 3 * DAY - 9 * HOUR,
    },
    {
        kind: "email",
        field: "to",
        value: "r…@claims-desk.io",
        hash: "c47d2b9e6001",
        firstSeenAt: NOW - 13 * DAY - 7 * HOUR,
        quarantinedAt: NOW - 13 * DAY - HOUR,
        runs: 5,
        blockedAttempts: 2,
        agents: ["billing", "support"],
        lastAttemptAt: NOW - 12 * DAY,
    },
];

// Two values seen in more than one run and three seen once
export const WATCHING: WatchedValue[] = [
    {
        kind: "iban",
        field: "iban",
        value: "DE44…0613",
        hash: "1a2b3c4d5e6f",
        firstSeenAt: NOW - 4 * MINUTE,
        runs: 1,
        agents: ["billing"],
    },
    {
        kind: "email",
        field: "to",
        value: "r…@claims-desk.io",
        hash: "2b3c4d5e6f70",
        firstSeenAt: NOW - 17 * MINUTE,
        runs: 2,
        agents: ["support"],
    },
    {
        kind: "email",
        field: "to",
        value: "c…@claims-desk.io",
        hash: "3c4d5e6f7081",
        firstSeenAt: NOW - 3 * MINUTE,
        runs: 1,
        agents: ["support"],
    },
    {
        kind: "email",
        field: "to",
        value: "a…@claims-desk.io",
        hash: "4d5e6f708192",
        firstSeenAt: NOW - 9 * HOUR,
        runs: 1,
        agents: ["support"],
    },
    {
        kind: "iban",
        field: "iban",
        value: "NL91…4300",
        hash: "5e6f708192a3",
        firstSeenAt: NOW - 2 * DAY - 6 * HOUR,
        runs: 3,
        agents: ["billing"],
    },
];

// Every section with something in it
export function fullFleet(changes: Partial<FleetData> = {}): FleetData {
    return emptyFleet({
        incidentsBySource: SOURCES,
        incidentsByTool: TOOLS,
        blocksByGuard: BY_GUARD,
        blocksHeatmap: HEATMAP,
        agentPoints: POINTS,
        untrustedLinks: LINKS,
        runLimits: LIMITS,
        quarantine: QUARANTINE,
        watching: WATCHING,
        ...changes,
    });
}

import type { BlocksByGuard, BlocksHeatmap, FleetData, RunLimitCount } from "@/lib/data/fleet";
import type { GuardType } from "@/lib/data/types";
import { DAY, NOW } from "../time";

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

export const SOURCES: FleetData["incidentsBySource"] = [
    { origin: "web page", trust: "untrusted", count: 1200 },
    { origin: "user", trust: "trusted", count: 2 },
    { origin: "email", trust: "untrusted", count: 3 },
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
    { name: "depth", rule: "max-depth", mode: "observe", wouldStop: 3, stopped: 0 },
    { name: "fan-out", rule: "max-fan-out", mode: "observe", wouldStop: 1, stopped: 0 },
    { name: "loops", rule: "max-loops", mode: "block", wouldStop: 0, stopped: 2 },
    { name: "steps", rule: "max-steps", mode: "observe", wouldStop: 6, stopped: 0 },
    { name: "cost", rule: "max-cost", mode: "observe", wouldStop: 0, stopped: 0 },
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
        ...changes,
    });
}

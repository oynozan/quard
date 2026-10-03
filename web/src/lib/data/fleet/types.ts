import type { LimitName } from "../guards/limits";
import type { GuardMode, GuardType, Label } from "../types";

export type GuardBlockSeries = { guard: GuardType; values: number[]; total: number };

export type BlocksByGuard = {
    startAt: number;
    // One value per day, oldest first, per guard type.
    series: GuardBlockSeries[];
    totals: number[];
};

export type BlocksHeatmap = {
    // Monday first.
    days: string[];
    // values[day][hour], blocks summed over the window. Hours are UTC.
    values: number[][];
    // The busiest hour for each hour of the day, summed over days.
    hourTotals: number[];
    max: number;
    total: number;
};

export type QuarantinedValue = {
    kind: "iban" | "email" | "domain";
    field: string;
    // Masked like the rest of the dashboard. Domains stay in clear.
    value: string;
    hash: string;
    firstSeenAt: number;
    quarantinedAt: number;
    runs: number;
    blockedAttempts: number;
    agents: string[];
    lastAttemptAt: number;
};

// New values the fleet check is counting, not yet at 5 runs.
export type WatchedValue = {
    kind: "iban" | "email" | "domain";
    field: string;
    value: string;
    hash: string;
    firstSeenAt: number;
    runs: number;
    agents: string[];
};

export type RunLimitCount = {
    name: LimitName;
    limit: number;
    unit: string;
    mode: GuardMode;
    // Observe mode: runs that went over and ran anyway.
    wouldStop: number;
    // Block mode: runs the limit stopped.
    stopped: number;
};

export type FleetData = {
    windowDays: number;
    startAt: number;
    endAt: number;
    incidentsBySource: { origin: string; label: Label; count: number }[];
    incidentsByTool: { tool: string; count: number }[];
    blocksByGuard: BlocksByGuard;
    blocksHeatmap: BlocksHeatmap;
    agentPoints: { agent: string; entry: number; turning: number; damage: number }[];
    untrustedLinks: { from: string; to: string; total: number; untrusted: number; untrustedShare: number }[];
    runLimits: RunLimitCount[];
    quarantine: QuarantinedValue[];
    watching: WatchedValue[];
    fleetCheck: {
        fields: string[];
        newForDays: number;
        runsToBlock: number;
        withinHours: number;
        observeUntil: number | null;
    };
};

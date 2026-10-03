import type { LimitName } from "../runs/types";
import type { GuardMode, GuardType, Label } from "../types";

export type GuardBlockSeries = { guard: GuardType; values: number[]; total: number };

export type BlocksByGuard = {
    // UTC midnight of the first day
    startAt: number;
    // One value per UTC day, oldest first, per guard type
    series: GuardBlockSeries[];
    totals: number[];
};

export type BlocksHeatmap = {
    // values[weekday][hour] with Monday first, summed over the window in UTC
    values: number[][];
    // Blocks in each hour of the day, summed over the weekdays
    hourTotals: number[];
    total: number;
};

export type QuarantinedValue = {
    kind: "iban" | "email" | "domain";
    field: string;
    // Masked like the rest of the dashboard, with domains in clear
    value: string;
    hash: string;
    firstSeenAt: number;
    quarantinedAt: number;
    runs: number;
    blockedAttempts: number;
    agents: string[];
    lastAttemptAt: number;
};

// New values the fleet check is counting, not yet at 5 runs
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
    // Runs that went over an observe-mode limit and ran anyway
    wouldStop: number;
    // Runs a block-mode limit stopped
    stopped: number;
};

export type FleetData = {
    startAt: number;
    endAt: number;
    incidentsBySource: { origin: string; label: Label; count: number }[];
    incidentsByTool: { tool: string; count: number }[];
    blocksByGuard: BlocksByGuard;
    blocksHeatmap: BlocksHeatmap;
    agentPoints: { agent: string; entry: number; turning: number }[];
    // Delegations from one agent to another, and how many of them read untrusted content
    untrustedLinks: { from: string; to: string; delegations: number; untrusted: number; untrustedShare: number }[];
    runLimits: RunLimitCount[];
    quarantine: QuarantinedValue[];
    watching: WatchedValue[];
};

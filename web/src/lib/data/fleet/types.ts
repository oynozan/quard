import type { LimitName } from "../runs/types";
import type { GuardMode, GuardType, Trust } from "../types";

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
    kind: "iban" | "email" | "domain" | "wallet";
    field: string;
    // The fleet key, such as "iban:DE89…3000#<hash>" or "domain:acme.com"
    key: string;
    // Masked like the rest of the dashboard. Domains stay in clear.
    value: string;
    // Null for domains, which have no hash
    hash: string | null;
    firstSeenAt: number;
    quarantinedAt: number;
    // Quarantined while the check only observed: it would block, but does not
    observe: boolean;
    runs: number;
    blockedAttempts: number;
    agents: string[];
    lastAttemptAt: number | null;
};

// New values the fleet check is counting, not yet at the runs that block.
export type WatchedValue = {
    kind: "iban" | "email" | "domain" | "wallet";
    field: string;
    key: string;
    value: string;
    hash: string | null;
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
    incidentsBySource: { origin: string; trust: Trust; count: number }[];
    incidentsByTool: { tool: string; count: number }[];
    blocksByGuard: BlocksByGuard;
    blocksHeatmap: BlocksHeatmap;
    agentPoints: { agent: string; entry: number; turning: number }[];
    // Delegations from one agent to another, and how many of them read untrusted content
    untrustedLinks: { from: string; to: string; delegations: number; untrusted: number; untrustedShare: number }[];
    runLimits: RunLimitCount[];
};

// How the fleet check decides, and until when it only observes
export type FleetCheckFacts = {
    // The fields it has seen values in
    fields: string[];
    newForDays: number;
    runsToBlock: number;
    withinHours: number;
    observeUntil: number | null;
};

// The quarantine section, read from Postgres at `now`
export type QuarantineData = {
    now: number;
    quarantine: QuarantinedValue[];
    watching: WatchedValue[];
    check: FleetCheckFacts;
};

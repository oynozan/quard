import type { GuardMode } from "../types";

export type LimitName = "depth" | "fan-out" | "loops" | "steps" | "cost";

// Run limits, PROJECT.md "Run limits" (Balanced). Product defaults start in observe mode.
// The team switched the loop limit to block after a delegation loop.
export type RunLimit = {
    name: LimitName;
    rule: string;
    limit: number;
    unit: string;
    mode: GuardMode;
    hash: string;
};

export const RUN_LIMITS: RunLimit[] = [
    { name: "depth", rule: "run-limits.depth", limit: 3, unit: "levels", mode: "observe", hash: "5c0e9a7b31d4" },
    {
        name: "fan-out",
        rule: "run-limits.fan-out",
        limit: 10,
        unit: "helpers per agent",
        mode: "observe",
        hash: "5c0e9a7b31d4",
    },
    {
        name: "loops",
        rule: "run-limits.loops",
        limit: 5,
        unit: "handoffs back and forth",
        mode: "block",
        hash: "d17a4c2e8b90",
    },
    { name: "steps", rule: "run-limits.steps", limit: 200, unit: "model calls", mode: "observe", hash: "5c0e9a7b31d4" },
    { name: "cost", rule: "run-limits.cost", limit: 5, unit: "USD", mode: "observe", hash: "5c0e9a7b31d4" },
];

export function runLimit(name: LimitName): RunLimit {
    return RUN_LIMITS.find((limit) => limit.name === name) ?? RUN_LIMITS[0];
}

// The replay and AI reviewer budget per incident, PROJECT.md "Replay".
export const REPLAY_CAP_USD = 5;
export const REPLAY_THRESHOLD = 0.0182;
export const REPLAY_MAX_PER_SIDE = 20;

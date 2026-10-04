import { RUN_LIMIT_RULES, type RunLimitRow, type RunLimitRule } from "@quard/db";
import type { LimitName } from "../runs/types";
import type { RunLimitCount } from "./types";

const NAMES: Record<RunLimitRule, LimitName> = {
    "max-depth": "depth",
    "max-fan-out": "fan-out",
    "max-loops": "loops",
    "max-steps": "steps",
    "max-cost": "cost",
};

// Every run limit once some run went over one. A limit no run went over
// takes the newest mode, as all run limits share one.
export function runLimitsOf(rows: RunLimitRow[]): RunLimitCount[] {
    if (rows.length === 0) return [];
    const newest = rows.reduce((a, b) => (b.lastAt > a.lastAt ? b : a));
    return RUN_LIMIT_RULES.map((rule) => {
        const row = rows.find((found) => found.rule === rule);
        return {
            name: NAMES[rule],
            rule,
            mode: row?.mode ?? newest.mode,
            wouldStop: row?.wouldStop ?? 0,
            stopped: row?.stopped ?? 0,
        };
    });
}

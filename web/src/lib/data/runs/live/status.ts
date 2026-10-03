import { MINUTE } from "@/lib/time";
import type { DecisionCounts, RunStatus } from "../../types";
import type { Step } from "../types";

// A run with no recorded end, such as one outside quard.run(), counts as running until quiet this long
export const IDLE_MS = 2 * MINUTE;

export type LastStep = { kind: string; status: string } | null;
export type Outcome = "completed" | "failed" | "blocked" | null;

// The recorded outcome wins. Without one, the status is read from the last step.
export function statusOf(lastEventAt: number, last: LastStep, now: number, outcome: Outcome = null): RunStatus {
    if (outcome) return outcome;
    if (now - lastEventAt < IDLE_MS) return "running";
    if (last?.status === "error") return "failed";
    if (last?.kind === "tool_call" && last.status === "blocked") return "blocked";
    return "completed";
}

// Enforced blocks and asks count as such. Everything else, observe mode included, counts as allowed.
export function decisionCounts(steps: Step[]): DecisionCounts {
    const counts: DecisionCounts = { allowed: 0, asked: 0, blocked: 0 };
    for (const step of steps) {
        if (!step.guard) continue;
        const enforced = step.guard.mode !== "observe";
        if (enforced && step.guard.outcome === "block") counts.blocked += 1;
        else if (enforced && step.guard.outcome === "ask") counts.asked += 1;
        else counts.allowed += 1;
    }
    return counts;
}

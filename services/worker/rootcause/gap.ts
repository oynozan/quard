import { isDetection, type MissingGuard } from "@quard/db";
import type { Entry } from "./entry.ts";
import type { StoredDecision, StoredStep } from "./run.ts";

// Decisions that stop a call or send it to a person
const STOPS = new Set(["block", "ask"]);
// Guards that check a call's arguments before it runs
const CHECKS = new Set(["action", "egress", "approval"]);

// A rule in observe mode, which only recorded what it would do
function observing({ guard, rule, decision }: StoredDecision, tool: string): MissingGuard {
    const text = `The ${guard} rule "${rule}" on ${tool} is in observe mode, so it only recorded "would ${decision}"`;
    return { text, tool, guard, rule, observe: true };
}

// For content a guard found: null when a guard acted on it, else the rule that only recorded
export function detectionGap(damage: StoredStep, decisions: StoredDecision[]): MissingGuard | null {
    const found = decisions.filter((decision) => decision.stepId === damage.stepId && isDetection(decision));
    const observed = found.find((decision) => decision.mode === "observe");
    return observed === undefined || found.some((decision) => decision.enforced)
        ? null
        : observing(observed, damage.name);
}

// The guard that would have stopped the call. Null when an enforced guard
// blocked the call or sent it to a person.
export function missingGuard(damage: StoredStep, decisions: StoredDecision[], entry: Entry): MissingGuard | null {
    const own = decisions.filter((decision) => decision.stepId === damage.stepId);
    if (damage.status === "blocked" || own.some((decision) => decision.enforced && STOPS.has(decision.decision))) {
        return null;
    }
    const tool = damage.name;
    const observed = own.find((decision) => decision.mode === "observe" && STOPS.has(decision.decision));
    if (observed !== undefined) {
        return observing(observed, tool);
    }
    const none = { tool, guard: null, rule: null, observe: false };
    if (!own.some((decision) => CHECKS.has(decision.guard))) {
        return { ...none, text: `${tool} has no action, egress or approval guard` };
    }
    if (entry.trust === "untrusted" && entry.key !== null) {
        const kind = entry.key.slice(0, entry.key.indexOf(":"));
        return { ...none, text: `No rule on ${tool} checks where the ${kind} comes from` };
    }
    return { ...none, text: `No rule on ${tool} stopped this call` };
}

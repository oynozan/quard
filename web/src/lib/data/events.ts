import { NOW, MINUTE } from "./rng";
import { catalogRuns } from "./runs/catalog";
import type { GuardDecision, Step } from "./runs/types";
import type { DecisionEvent } from "./types";

const WINDOW = 10 * MINUTE;
const LINES = 12;

// A short line for the log. Observe-mode results say what they would have done.
function detailOf(guard: GuardDecision, call: Step | undefined): string {
    let text = guard.reason;
    if (guard.guard === "source" && call?.output) {
        const origin = call.output.label.origin;
        const where = origin.slice(origin.indexOf(":") + 1);
        if (!guard.scan?.scanned) text = `unscanned · ${call.detail}`;
        else text = guard.scan.findings.length ? `${where} · ${guard.scan.findings[0]}` : where;
    } else if (guard.guard === "approval" && call) {
        text = call.detail;
    } else if (guard.guard === "egress" && call) {
        const to = call.args.find((arg) => arg.name === "to")?.value;
        text = to ? `${to} · ${guard.reason}` : guard.reason;
    }
    return guard.mode === "observe" && guard.outcome !== "allow" ? `would ${guard.outcome} · ${text}` : text;
}

// The latest guard decisions across runs, oldest first, as the live log shows them.
export function latestDecisions(): DecisionEvent[] {
    const events: DecisionEvent[] = [];
    for (const run of catalogRuns()) {
        if (run.detail.summary.startedAt + run.detail.summary.durationMs < NOW - WINDOW) continue;
        const steps = new Map(run.detail.steps.map((step) => [step.id, step]));
        for (const step of run.detail.steps) {
            if (!step.guard || step.startedAt < NOW - WINDOW) continue;
            // Counter checks that let a call through would fill the log, so they are left out.
            if (step.guard.guard === "limit" && step.guard.outcome === "allow") continue;
            const observed = step.guard.mode === "observe";
            events.push({
                at: step.startedAt,
                agent: step.agent,
                tool: step.guard.tool,
                guard: step.guard.guard,
                // In observe mode the call ran, so the log shows what happened.
                outcome: observed ? (step.guard.guard === "source" ? "pass" : "allow") : step.guard.outcome,
                runId: run.detail.summary.id,
                detail: detailOf(step.guard, steps.get(step.parentId ?? "")),
            });
        }
    }
    return events.sort((a, b) => a.at - b.at).slice(-LINES);
}

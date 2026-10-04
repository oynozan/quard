import type { DamageKind, HandoffFault, IncidentCategory, MissingGuard, StoredVerdict, VerdictPlace } from "@quard/db";
import { contentEntry, pickEntry, stepEntry, type Entry } from "./entry.ts";
import { detectionGap, missingGuard } from "./gap.ts";
import { acrossAgentsOf, carrierOf, handoffFaultOf } from "./handoff.ts";
import { callIdsOf, happenedBy, keysOf, readBy, versionOf, type StoredRun, type StoredStep } from "./run.ts";
import { traceValues, type TracedValue } from "./trace.ts";

function placeOf({ stepId, agent, at }: { stepId: string; agent: string; at: Date }): VerdictPlace {
    return { stepId, agent, at: at.toISOString() };
}

// The model call that asked for the damaging call, else the agent's last one before it
function turningPoint(steps: StoredStep[], damage: StoredStep): StoredStep {
    const models = steps
        .filter((step) => step.kind === "model_call" && step.agent === damage.agent && step.stepId !== damage.stepId)
        .filter(happenedBy(damage.at));
    const asked = models.find((step) => damage.callId !== null && callIdsOf(step).includes(damage.callId));
    return asked ?? models.at(-1) ?? damage;
}

// ponytail: any failed tool of the agent before the turning point counts as the cause.
// Check that its error reached the model once model inputs are recorded.
function brokenTool(steps: StoredStep[], turning: StoredStep): StoredStep | undefined {
    return steps
        .filter((step) => step.kind === "tool_call" && step.agent === turning.agent && step.status === "error")
        .filter(happenedBy(turning.at))
        .at(-1);
}

function categoryOf(
    traced: Entry,
    fault: HandoffFault | null,
    broken: boolean,
    gap: MissingGuard | null,
): IncidentCategory {
    if (traced.trust === "untrusted") {
        return "bad input";
    }
    if (fault !== null) {
        return "bad handoff";
    }
    if (broken) {
        return "broken tool";
    }
    return gap === null ? "bad reasoning" : "missing guard";
}

// The agent version of each named agent's latest model call up to the turning point
function versionsOf(steps: StoredStep[], agents: string[], turning: StoredStep): StoredVerdict["versions"] {
    const models = steps.filter((step) => step.kind === "model_call").filter(happenedBy(turning.at));
    return [...new Set(agents)].flatMap((agent) => {
        const version = models
            .filter((step) => step.agent === agent)
            .map(versionOf)
            .findLast((found) => found !== undefined);
        return version === undefined ? [] : [{ agent, version }];
    });
}

function storedValues(values: TracedValue[]): StoredVerdict["values"] {
    return values.map((value) => ({
        ...value,
        appearances: value.appearances.map((item) => ({ ...item, at: item.at.toISOString() })),
    }));
}

type Cause = { category: IncidentCategory; entry: Entry; gap: MissingGuard | null; fault: HandoffFault | null };

// Where the harm came in, traced from the call's values and what the agent read
function tracedCause(run: StoredRun, values: TracedValue[], damage: StoredStep, turning: StoredStep): Cause {
    const read = run.labels.filter((label) => label.agent === turning.agent).filter(readBy(turning));
    const traced = pickEntry(values, read, turning);
    const trusted = traced.trust === "trusted";
    const carrier = carrierOf(run.messages, traced.agent, damage, turning);
    const fault = trusted ? handoffFaultOf(carrier, run.messages, values, run.labels, damage) : null;
    // A value a handoff carried explains the call better than a failed tool
    const broken = trusted && fault === null ? brokenTool(run.steps, turning) : undefined;
    const entry = broken === undefined ? traced : stepEntry(broken, `tool:${broken.name}`);
    const gap = missingGuard(damage, run.decisions, entry);
    return { category: categoryOf(traced, fault, broken !== undefined, gap), entry, gap, fault };
}

// The content a guard flagged in what the call returned. Undefined until its label arrives.
function detectedCause(run: StoredRun, damage: StoredStep): Cause | undefined {
    const content = run.labels.find((label) => label.stepId === damage.stepId);
    const gap = detectionGap(damage, run.decisions);
    return content && { category: "bad input", entry: contentEntry(content, null), gap, fault: null };
}

// The model call a run limit stopped, from its decision: an enforced stop never sent it
function stoppedCall(run: StoredRun, stepId: string): StoredStep | undefined {
    const stop = run.decisions.find((item) => item.stepId === stepId && item.guard === "limit");
    return (
        stop && {
            stepId,
            kind: "model_call",
            agent: stop.agent,
            name: stop.tool,
            callId: null,
            status: stop.enforced ? "blocked" : "ok",
            at: stop.at,
            durationMs: 0,
            detail: {},
        }
    );
}

// The verdict for one damaging step: a tool call by default, the call whose
// content a guard found with "detection", or a stopped model call with "limit".
// Undefined when the run does not hold it yet.
export function findVerdict(run: StoredRun, damageStepId: string, kind?: DamageKind): StoredVerdict | undefined {
    const damage =
        kind === "limit"
            ? stoppedCall(run, damageStepId)
            : run.steps.find((step) => step.stepId === damageStepId && step.kind === "tool_call");
    if (damage === undefined) {
        return undefined;
    }
    const turning = turningPoint(run.steps, damage);
    const values = traceValues(keysOf(damage), run.labels, turning);
    const cause = kind === "detection" ? detectedCause(run, damage) : tracedCause(run, values, damage, turning);
    if (cause === undefined) {
        return undefined;
    }
    const { category, entry, gap, fault } = cause;
    return {
        category,
        entry: { ...entry, at: entry.at.toISOString() },
        turning: placeOf(turning),
        damage: {
            ...placeOf(damage),
            tool: damage.name,
            ran: damage.status !== "blocked",
            ...(kind === undefined ? {} : { kind }),
        },
        missingGuard: gap,
        values: storedValues(values),
        versions: versionsOf(run.steps, [entry.agent, turning.agent, damage.agent], turning),
        acrossAgents: acrossAgentsOf(run.messages, entry, turning, damage),
        handoffFault: fault,
    };
}

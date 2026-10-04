import type { IncidentCategory, MissingGuard, StoredVerdict, VerdictPlace } from "@quard/db";
import { pickEntry, stepEntry, type Entry } from "./entry.ts";
import { missingGuard } from "./gap.ts";
import { callIdsOf, happenedBy, keysOf, readBy, versionOf, type StoredRun, type StoredStep } from "./run.ts";
import { traceValues, type TracedValue } from "./trace.ts";

function placeOf({ stepId, agent, at }: { stepId: string; agent: string; at: Date }): VerdictPlace {
    return { stepId, agent, at: at.toISOString() };
}

// The model call that asked for the damaging call, else the agent's last one before it
function turningPoint(steps: StoredStep[], damage: StoredStep): StoredStep {
    const models = steps
        .filter((step) => step.kind === "model_call" && step.agent === damage.agent)
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

// "bad handoff" needs messages between agents, which come with M4
function categoryOf(traced: Entry, broken: boolean, gap: MissingGuard | null): IncidentCategory {
    if (traced.trust === "untrusted") {
        return "bad input";
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

// The verdict for one damaging tool call. Undefined when the run has no such tool call.
export function findVerdict(run: StoredRun, damageStepId: string): StoredVerdict | undefined {
    const damage = run.steps.find((step) => step.stepId === damageStepId && step.kind === "tool_call");
    if (damage === undefined) {
        return undefined;
    }
    const turning = turningPoint(run.steps, damage);
    const values = traceValues(keysOf(damage), run.labels, turning);
    const read = run.labels.filter((label) => label.agent === turning.agent).filter(readBy(turning));
    const traced = pickEntry(values, read, turning);
    const broken = traced.trust === "trusted" ? brokenTool(run.steps, turning) : undefined;
    const entry = broken === undefined ? traced : stepEntry(broken, `tool:${broken.name}`);
    const gap = missingGuard(damage, run.decisions, entry);
    return {
        category: categoryOf(traced, broken !== undefined, gap),
        entry: { ...entry, at: entry.at.toISOString() },
        turning: placeOf(turning),
        damage: { ...placeOf(damage), tool: damage.name, ran: damage.status !== "blocked" },
        missingGuard: gap,
        values: storedValues(values),
        versions: versionsOf(run.steps, [entry.agent, turning.agent, damage.agent], turning),
    };
}

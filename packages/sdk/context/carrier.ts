import { randomBytes } from "node:crypto";
import { extractValues, isRunId, isStepId } from "@quard/shared";
import type { ContentIndex } from "../labels/content-index.ts";
import { printOf } from "../labels/content-index.ts";
import { findRecord, keptRun, saveRecord, type ValueRecord } from "../labels/records.ts";
import { textOf } from "../labels/text-of.ts";
import { exactOccurrences } from "../labels/value-labels.ts";
import { newRun } from "./run.ts";
import { currentScope, runScope, withScope, type Scope } from "./scope.ts";

// The three items that travel with a message between agents
export type Carrier = {
    runId: string;
    parentStepId?: string;
    labelRef: string;
};

export type InjectOptions = {
    content: unknown;
};

export type ResumeOptions = {
    agent?: string;
    tools?: string[];
};

// The carrier each resumed scope came in with, for receive guards inside it
const resumed = new WeakMap<Scope, Carrier>();

// A carrier read from a channel, or undefined when it is missing or unreadable
export function readCarrier(value: unknown): Carrier | undefined {
    if (typeof value !== "object" || value === null) {
        return undefined;
    }
    const { runId, parentStepId, labelRef } = value as Record<string, unknown>;
    if (typeof runId !== "string" || !isRunId(runId) || typeof labelRef !== "string") {
        return undefined;
    }
    if (parentStepId === undefined) {
        return { runId, labelRef };
    }
    return typeof parentStepId === "string" && isStepId(parentStepId) ? { runId, parentStepId, labelRef } : undefined;
}

// Each traced value with the label it had where it first appeared. Only
// the value itself counts: a look-alike host vouches for nothing.
function valuesOf(text: string, index: ContentIndex): ValueRecord[] {
    const found = new Map<string, ValueRecord>();
    for (const { type, value, keys } of extractValues(text)) {
        const [first] = exactOccurrences({ type, value, occurrences: index.lookup(keys), modelGenerated: false });
        if (first !== undefined && !found.has(value)) {
            const { origin, trust, sensitivity, flags, stepId } = first;
            found.set(value, { value, key: `${type}:${value}`, origin, trust, sensitivity, flags, stepId });
        }
    }
    return [...found.values()];
}

// quard.inject(): stores the message's labels and returns what travels with it
export function inject(options: InjectOptions): Carrier {
    const scope = currentScope();
    if (scope === undefined) {
        throw new Error("quard.inject() must be called inside quard.run()");
    }
    const text = textOf(options.content);
    const labelRef = randomBytes(8).toString("hex");
    const stepId = scope.lastStepId;
    saveRecord(
        {
            ref: labelRef,
            runId: scope.run.runId,
            stepId,
            sender: scope.agent,
            depth: scope.depth,
            print: printOf(text),
            label: scope.run.index.context(),
            values: valuesOf(text, scope.run.index),
        },
        scope.run,
    );
    return stepId === undefined
        ? { runId: scope.run.runId, labelRef }
        : { runId: scope.run.runId, parentStepId: stepId, labelRef };
}

// quard.resume(): runs fn inside the run the carrier names. The run
// started elsewhere, so its start and end are not recorded here.
export function resume<T>(carrier: unknown, fn: () => T, options: ResumeOptions = {}): T {
    const checked = readCarrier(carrier);
    if (checked === undefined) {
        // Messages received here have nothing to vouch for them
        return runScope({ agent: options.agent, tools: options.tools }, fn);
    }
    const found = findRecord(checked.labelRef);
    const known = found?.runId === checked.runId ? found : undefined;
    const scope: Scope = {
        run: keptRun(checked.runId) ?? newRun(checked.runId),
        agent: options.agent ?? "default",
        parentStepId: checked.parentStepId,
        tools: options.tools === undefined ? undefined : new Set(options.tools),
        lastStepId: undefined,
        depth: known === undefined ? 0 : known.depth + 1,
    };
    resumed.set(scope, checked);
    return withScope(scope, fn);
}

export function resumedCarrier(scope: Scope | undefined): Carrier | undefined {
    return scope === undefined ? undefined : resumed.get(scope);
}

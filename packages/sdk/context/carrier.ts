import { randomBytes } from "node:crypto";
import { extractValues, isRunId, isStepId, keyText, newStepId } from "@quard/shared";
import { now, record } from "../core/recorder.ts";
import type { ContentIndex } from "../labels/content-index.ts";
import { printOf } from "../labels/print.ts";
import { findRecord, keptRun, saveRecord, type FoundRecord, type ValueRecord } from "../labels/records.ts";
import { exactOccurrences } from "../labels/value-labels.ts";
import { vouchedLabel } from "../labels/vouched-label.ts";
import { uploadsOn } from "../transport/configure.ts";
import { storeLabels } from "../transport/labels.ts";
import { activeControl } from "../transport/link/active.ts";
import { readBaggage } from "./baggage.ts";
import { newRun } from "./run.ts";
import { currentScope, narrowTools, runScope, withScope, type Scope } from "./scope.ts";
import { startSharing } from "./shared-run.ts";

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

// A message's carrier and the record it points to, if one was found
export type Incoming = { carrier: Carrier; found: FoundRecord | undefined };

// What each resumed scope came in with, for receive guards inside it
const resumed = new WeakMap<Scope, Incoming>();

// Deeper than any depth limit, even one raised later
const UNKNOWN_DEPTH = Number.MAX_SAFE_INTEGER;

// A carrier from a channel or a baggage header string, undefined when unreadable
export function readCarrier(value: unknown): Carrier | undefined {
    if (typeof value === "string") {
        return readCarrier(readBaggage(value));
    }
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
            found.set(value, { type, value, key: `${type}:${value}`, origin, trust, sensitivity, flags, stepId });
        }
    }
    return [...found.values()];
}

function warn(runId: string, agent: string, code: string, stepId = newStepId()): void {
    record({ type: "warning", runId, stepId, agent, at: now(), code });
}

// quard.inject(): stores the message's labels, then returns what travels with it
export async function inject(options: InjectOptions): Promise<Carrier> {
    const scope = currentScope();
    if (scope === undefined) {
        throw new Error("quard.inject() must be called inside quard.run()");
    }
    const { run, agent } = scope;
    // Values under secret-named fields never become records
    const text = keyText(options.content);
    const labelRef = randomBytes(8).toString("hex");
    const stepId = scope.lastStepId;
    const stored = saveRecord(
        {
            ref: labelRef,
            runId: run.runId,
            stepId,
            sender: agent,
            depth: scope.depth,
            print: printOf(options.content),
            label: vouchedLabel(run.index),
            values: valuesOf(text, run.index),
            tools: scope.tools === undefined ? undefined : [...scope.tools].sort(),
        },
        run,
    );
    // The run now spans processes, so its counters move to control
    startSharing(run);
    // Without uploads the record lives in this process only. That is a
    // problem once the control link lets receivers elsewhere look it up.
    const lookedUpElsewhere = uploadsOn() || activeControl() !== undefined;
    if (lookedUpElsewhere && !(await storeLabels([stored]))) {
        // A receiver in another process will read the message as untrusted
        warn(run.runId, agent, "label_record_not_stored", stepId);
    }
    return stepId === undefined ? { runId: run.runId, labelRef } : { runId: run.runId, parentStepId: stepId, labelRef };
}

// quard.resume(): runs fn inside the run the carrier names. The run
// started elsewhere, so its start and end are not recorded here.
export async function resume<T>(carrier: unknown, fn: () => T, options: ResumeOptions = {}): Promise<Awaited<T>> {
    const checked = readCarrier(carrier);
    if (checked === undefined) {
        // Messages received here have nothing to vouch for them
        return await runScope({ agent: options.agent, tools: options.tools }, fn);
    }
    const found = await findRecord(checked.labelRef);
    const known = found?.record.runId === checked.runId ? found.record : undefined;
    const kept = keptRun(checked.runId);
    const run = kept ?? newRun(checked.runId);
    if (kept === undefined) {
        startSharing(run);
    }
    const agent = options.agent ?? "default";
    if (known === undefined) {
        // Without the record, only the agent's own list caps its tools, and
        // its depth is past any limit, so it may not delegate further
        warn(run.runId, agent, "label_record_not_found");
    }
    // The sender's tools cap what this agent may use
    const granted = known?.tools === undefined ? undefined : new Set(known.tools);
    const scope: Scope = {
        run,
        agent,
        parentStepId: checked.parentStepId,
        tools: narrowTools(granted, options.tools),
        lastStepId: undefined,
        depth: known === undefined ? UNKNOWN_DEPTH : known.depth + 1,
    };
    resumed.set(scope, { carrier: checked, found });
    return await withScope(scope, fn);
}

// What a receive guard reads a message with, else what quard.resume() came in with
export async function incomingMessage(value: unknown, scope: Scope | undefined): Promise<Incoming | undefined> {
    const kept = scope === undefined ? undefined : resumed.get(scope);
    if (value === undefined || value === null) {
        return kept;
    }
    const carrier = readCarrier(value);
    if (carrier === undefined) {
        return undefined;
    }
    // The record quard.resume() found is not looked up again
    if (kept !== undefined && kept.carrier.labelRef === carrier.labelRef) {
        return { carrier, found: kept.found };
    }
    return { carrier, found: await findRecord(carrier.labelRef) };
}

import type { ContextLabel, Label } from "@quard/shared";
import type { RunState } from "../context/run.ts";

// The label one traceable value had where it first appeared in the sender's run
export type ValueRecord = {
    value: string;
    // The value's own index key, such as "iban:DE89..."
    key: string;
    origin: string;
    trust: Label["trust"];
    sensitivity: Label["sensitivity"];
    flags: string[];
    stepId: string;
};

// What a sender stores before a message leaves, so the receiver can label it
export type LabelRecord = {
    ref: string;
    runId: string;
    // The sender's latest step, if it made one
    stepId: string | undefined;
    sender: string;
    depth: number;
    // A hash of the content's normalized text
    print: string;
    // The sender run's context label when the message left
    label: ContextLabel;
    values: ValueRecord[];
};

const MAX_KEPT = 10_000;

const records = new Map<string, LabelRecord>();
// Runs that sent messages, so a resume in this process rejoins them
const runs = new Map<string, RunState>();

// Maps keep insertion order, so the first key is the oldest
function keep<T>(map: Map<string, T>, key: string, value: T): void {
    map.delete(key);
    map.set(key, value);
    if (map.size > MAX_KEPT) {
        map.delete(map.keys().next().value as string);
    }
}

export function saveRecord(record: LabelRecord, run: RunState): void {
    keep(records, record.ref, record);
    keep(runs, run.runId, run);
}

// Records live in this process for now; a lookup through control can come later
export function findRecord(ref: string): LabelRecord | undefined {
    return records.get(ref);
}

export function keptRun(runId: string): RunState | undefined {
    return runs.get(runId);
}

// Drops the kept runs, as if the receiver ran in another process
export function forgetRuns(): void {
    runs.clear();
}

export function clearRecords(): void {
    records.clear();
    runs.clear();
}

import type { MessageRecord } from "@quard/shared";
import type { RunState } from "../context/run.ts";
import { lookupLabels } from "../transport/labels.ts";
import { messageRecordOf, type SentMessage } from "./message-record.ts";
import { matchValues, type ValueRecord } from "./value-records.ts";

export type { SentMessage } from "./message-record.ts";
export type { ValueRecord } from "./value-records.ts";

// Raw values when this process made the record, else only their hashes
export type FoundRecord = { record: MessageRecord; values: ValueRecord[] | undefined };

const MAX_KEPT = 10_000;

const records = new Map<string, FoundRecord>();
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

export function isLabelRef(text: string): boolean {
    return /^[0-9a-f]{16}$/.test(text);
}

// Keeps the record here and returns it as it is stored elsewhere
export function saveRecord(sent: SentMessage, run: RunState): MessageRecord {
    const record = messageRecordOf(sent);
    keep(records, sent.ref, { record, values: sent.values });
    keep(runs, run.runId, run);
    return record;
}

// The record made in this process, else the one control has
export async function findRecord(ref: string): Promise<FoundRecord | undefined> {
    const kept = records.get(ref);
    if (kept !== undefined || !isLabelRef(ref)) {
        return kept;
    }
    const found = await lookupLabels({ kind: "message", ref });
    const record = found?.find((item): item is MessageRecord => item.kind === "message" && item.ref === ref);
    return record === undefined ? undefined : { record, values: undefined };
}

// The values the record vouches for in the message's text
export function recordValues(found: FoundRecord, text: string): ValueRecord[] {
    return found.values ?? matchValues(text, found.record.values);
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

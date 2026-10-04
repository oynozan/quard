import { newStepId, type ContextLabel, type ContextLabelRecord, type MemoryRecord } from "@quard/shared";
import type { Scope } from "../context/scope.ts";
import { valueHash } from "../labels/hashed.ts";
import { printOf } from "../labels/print.ts";
import { textOf } from "../labels/text-of.ts";
import { vouchedLabel } from "../labels/vouched-label.ts";
import { storeLabels } from "../transport/labels.ts";
import { recordMemory } from "./event.ts";
import { keepLabels } from "./kept.ts";
import { MAX_ORIGINS } from "./merge.ts";
import { localHash, valueRecords } from "./values.ts";

const MAX_ORIGIN = 2000;

// The context label as a label record holds it
function labelRecord(label: ContextLabel): ContextLabelRecord {
    return {
        trust: label.trust,
        sensitivity: label.sensitivity,
        origins: label.origins.slice(0, MAX_ORIGINS).map((origin) => origin.slice(0, MAX_ORIGIN)),
        flagged: label.flagged,
    };
}

// Stores the item's labels before it is written, then writes it. A
// write whose labels the backend did not store still goes ahead: other
// processes read the item back as unlabeled, so untrusted.
export async function writeThrough(
    scope: Scope,
    store: string,
    value: unknown,
    write: () => Promise<unknown>,
): Promise<unknown> {
    const stepId = newStepId();
    const text = textOf(value);
    const print = printOf(value);
    const label = labelRecord(vouchedLabel(scope.run.index));
    keepLabels(print, { label, values: valueRecords(text, scope.run.index, localHash) });
    const record: MemoryRecord = {
        kind: "memory",
        store,
        print,
        runId: scope.run.runId,
        agent: scope.agent,
        label,
        values: valueRecords(text, scope.run.index, valueHash),
    };
    const stored = await storeLabels([record]).catch(() => false);
    const result = await write();
    const { trust, sensitivity } = label;
    recordMemory(scope, stepId, { store, op: "write", items: 1, verified: stored ? 1 : 0, trust, sensitivity });
    return result;
}

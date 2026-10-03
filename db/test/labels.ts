import type { ContextLabelRecord, MemoryRecord, MessageRecord, ValueRecord } from "@quard/shared";

export const LABEL_RUN = "1".repeat(32);
export const REF = "a".repeat(16);
export const PRINT = "b".repeat(64);

export const TRUSTED: ContextLabelRecord = {
    trust: "trusted",
    sensitivity: "internal",
    origins: ["user"],
    flagged: false,
};

export const UNTRUSTED: ContextLabelRecord = {
    trust: "untrusted",
    sensitivity: "public",
    origins: ["user", "web:acme-billing.net"],
    flagged: true,
};

export function valueRecord(fields: Partial<ValueRecord> = {}): ValueRecord {
    return {
        hash: "c".repeat(32),
        origin: "web:acme-billing.net",
        trust: "untrusted",
        sensitivity: "public",
        flags: ["instructions"],
        stepId: "2".repeat(16),
        ...fields,
    };
}

// A message from the orchestrator to a helper
export function messageRecord(fields: Partial<MessageRecord> = {}): MessageRecord {
    return {
        kind: "message",
        ref: REF,
        runId: LABEL_RUN,
        stepId: "2".repeat(16),
        sender: "orchestrator",
        depth: 0,
        print: PRINT,
        label: UNTRUSTED,
        values: [valueRecord()],
        tools: ["payInvoice"],
        ...fields,
    };
}

// A note the billing agent wrote to shared memory
export function memoryRecord(fields: Partial<MemoryRecord> = {}): MemoryRecord {
    return {
        kind: "memory",
        store: "notes",
        print: PRINT,
        runId: LABEL_RUN,
        agent: "billing",
        label: TRUSTED,
        values: [],
        ...fields,
    };
}

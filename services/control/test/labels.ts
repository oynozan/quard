import type { MemoryRecord, MessageRecord } from "@quard/shared";
import { RUN, STEP } from "./messages.ts";

export const REF = "a".repeat(16);
export const PRINT = "b".repeat(64);

// What the orchestrator stored before its message to a helper left
export function messageRecord(fields: Partial<MessageRecord> = {}): MessageRecord {
    return {
        kind: "message",
        ref: REF,
        runId: RUN,
        stepId: STEP,
        sender: "orchestrator",
        depth: 0,
        print: PRINT,
        label: { trust: "untrusted", sensitivity: "public", origins: ["user", "web:acme.com"], flagged: false },
        values: [
            {
                hash: "c".repeat(32),
                origin: "web:acme.com",
                trust: "untrusted",
                sensitivity: "public",
                flags: [],
                stepId: STEP,
            },
        ],
        tools: ["payInvoice"],
        ...fields,
    };
}

// What the billing agent stored with a note in shared memory
export function memoryRecord(fields: Partial<MemoryRecord> = {}): MemoryRecord {
    return {
        kind: "memory",
        store: "notes",
        print: PRINT,
        runId: RUN,
        agent: "billing",
        label: { trust: "trusted", sensitivity: "internal", origins: ["user"], flagged: false },
        values: [],
        ...fields,
    };
}

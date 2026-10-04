import { z } from "zod";

// Label records: what a sender stores before a message leaves, and what a
// memory write stores, so another process can look the labels up later.
// Raw values never leave the process: each traced value goes by its hash.

const hex = (length: number) => z.string().regex(new RegExp(`^[0-9a-f]{${length}}$`));
const name = z.string().min(1).max(200);
const trust = z.enum(["trusted", "untrusted"]);
const sensitivity = z.enum(["internal", "public"]);

export const LABELS_PATH = "/v1/labels";

// The reference a message carries to its record
export const labelRef = hex(16);
// An HMAC-SHA-256 of the whole content, keyed with the project's hash key
export const contentPrint = hex(64);

export const contextLabelRecord = z.object({
    trust,
    sensitivity,
    origins: z.array(z.string().max(2000)).max(200),
    flagged: z.boolean(),
});

// The label one traced value had where it first appeared
export const valueRecord = z.object({
    // keyedHash(key, type, value) for a value as extractValues finds it
    hash: hex(32),
    origin: z.string().max(2000),
    trust,
    sensitivity,
    flags: z.array(z.string().max(100)).max(20),
    stepId: hex(16),
});

export const messageRecord = z.object({
    kind: z.literal("message"),
    ref: labelRef,
    runId: hex(32),
    // The sender's latest step, if it made one
    stepId: hex(16).optional(),
    sender: name,
    // Delegation levels below the agent that started the run
    depth: z.number().int().nonnegative().max(1000),
    print: contentPrint,
    // The sender run's context label when the message left
    label: contextLabelRecord,
    values: z.array(valueRecord).max(500),
    // The guarded tools the sender may use; the receiver gets no more
    tools: z.array(name).max(500).optional(),
});

export const memoryRecord = z.object({
    kind: z.literal("memory"),
    store: name,
    print: contentPrint,
    runId: hex(32),
    agent: name,
    // The writer run's context label at the write
    label: contextLabelRecord,
    values: z.array(valueRecord).max(500),
});

export const labelRecord = z.discriminatedUnion("kind", [messageRecord, memoryRecord]);

// The body of webhook's POST LABELS_PATH. It answers once they are stored.
export const labelUpload = z.object({ records: z.array(labelRecord).min(1).max(100) });

export type ContextLabelRecord = z.infer<typeof contextLabelRecord>;
export type ValueRecord = z.infer<typeof valueRecord>;
export type MessageRecord = z.infer<typeof messageRecord>;
export type MemoryRecord = z.infer<typeof memoryRecord>;
export type LabelRecord = z.infer<typeof labelRecord>;
export type LabelUpload = z.infer<typeof labelUpload>;

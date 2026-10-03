import { z } from "zod";
import { contentPrint, labelRecord, labelRef } from "../labels/records.ts";

// Label lookups and per-run counters, for runs that span processes

const hex = (length: number) => z.string().regex(new RegExp(`^[0-9a-f]{${length}}$`));
const id = hex(16);

// --- SDK to control ---

// The labels behind a message's reference or a memory item's print
export const lookupMessage = z.object({
    type: z.literal("lookup"),
    id,
    target: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("message"), ref: labelRef }),
        z.object({ kind: z.literal("memory"), print: contentPrint }),
    ]),
});

// Adds to a counter of one run, as count does for a day. Control
// answers with "counted".
export const runCountMessage = z.object({
    type: z.literal("run_count"),
    id,
    runId: hex(32),
    counter: z
        .string()
        .regex(/^(steps|cost|calls:.+|amount:.+)$/)
        .max(200),
    add: z.number().finite().nonnegative(),
    max: z.number().finite().nonnegative().optional(),
});

// --- control to SDK ---

// A message has at most one record. A memory item has one per distinct
// label it was written with, least trusted first.
export const labelsMessage = z.object({
    type: z.literal("labels"),
    id,
    records: z.array(labelRecord).max(20),
});

export type LookupMessage = z.infer<typeof lookupMessage>;
export type RunCountMessage = z.infer<typeof runCountMessage>;
export type LabelsMessage = z.infer<typeof labelsMessage>;

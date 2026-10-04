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

// The most counters one run_count adds to
export const MAX_RUN_COUNTS = 20;

// One addition to a run counter. With max it only adds while the run's
// total stays at or under it; without max it always adds.
export const runCount = z.object({
    counter: z
        .string()
        .regex(/^(steps|cost|calls:.+|amount:.+)$/)
        .max(200),
    add: z.number().finite().nonnegative(),
    max: z.number().finite().nonnegative().optional(),
});

// Adds to counters of one run, as count does for a day: all of them, or
// none when one would pass its max. Control answers with "run_counted".
export const runCountMessage = z.object({
    type: z.literal("run_count"),
    id,
    runId: hex(32),
    counts: z.array(runCount).min(1).max(MAX_RUN_COUNTS),
});

// --- control to SDK ---

// A message has at most one record. A memory item has one per distinct
// label it was written with, least trusted first.
export const labelsMessage = z.object({
    type: z.literal("labels"),
    id,
    records: z.array(labelRecord).max(20),
});

// Each counter's total, in the order sent. Nothing was added when ok
// is false.
export const runCountedMessage = z.object({
    type: z.literal("run_counted"),
    id,
    ok: z.boolean(),
    used: z.array(z.number()).max(MAX_RUN_COUNTS),
});

export type LookupMessage = z.infer<typeof lookupMessage>;
export type RunCount = z.infer<typeof runCount>;
export type RunCountMessage = z.infer<typeof runCountMessage>;
export type RunCountedMessage = z.infer<typeof runCountedMessage>;
export type LabelsMessage = z.infer<typeof labelsMessage>;

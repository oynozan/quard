import { z } from "zod";
import { runEvent } from "./schema.ts";

// Events reach webhook in batches of at most this many
export const MAX_BATCH = 500;

// And of at most this many bytes, events as JSON, unless one event alone is bigger
export const MAX_BATCH_BYTES = 3 * 1024 * 1024;

// One event as sent. The id makes a resend harmless; degraded marks
// an event that waited because the backend was down.
export const uploadItem = z.object({
    id: z.string().regex(/^[0-9a-f]{16}$/),
    degraded: z.boolean().optional(),
    event: runEvent,
});

export const uploadBatch = z.object({
    events: z.array(uploadItem).min(1).max(MAX_BATCH),
    // Events the SDK dropped, from a full buffer or because they could not be sent as JSON
    dropped: z.number().int().min(0).optional(),
});

export type UploadItem = z.infer<typeof uploadItem>;
export type UploadBatch = z.infer<typeof uploadBatch>;

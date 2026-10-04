import { MAX_BATCH, MAX_BATCH_BYTES, newEventId, type Redactor, type RunEvent, type UploadItem } from "@quard/shared";
import { addDropped, takeDropped, takeEvents } from "../core/recorder.ts";
import { prepareEvent } from "./prepare.ts";

export type Send = (url: string, init: RequestInit) => Promise<Response>;

export type UploaderOptions = {
    webhookUrl: string;
    key: string;
    redactor: Redactor;
    send?: Send;
    warn?: (message: string) => void;
};

export type Uploader = {
    // Sends everything buffered. False when the backend could not be reached.
    flush(): Promise<boolean>;
    start(): void;
    stop(): void;
};

type Batch = { items: UploadItem[]; dropped: number };
type Sized = { item: UploadItem; bytes: number };

// Retried every 1 s to 60 s while the backend is down (PROJECT.md)
const FIRST_DELAY = 1_000;
const MAX_DELAY = 60_000;
// An event older than this when sent is marked degraded
const LATE_MS = 30_000;

// Statuses where a resend could work; any other 4xx refuses the batch for good
function worthRetrying(status: number): boolean {
    return status >= 500 || status === 408 || status === 429;
}

const encoder = new TextEncoder();

// The event as sent with its size as JSON, or undefined when it can't be sent
function sized(event: RunEvent, redactor: Redactor, now: number): Sized | undefined {
    try {
        const item = {
            id: newEventId(),
            event: prepareEvent(event, redactor),
            ...(now - Date.parse(event.at) > LATE_MS ? { degraded: true } : {}),
        };
        return { item, bytes: encoder.encode(JSON.stringify(item)).length };
    } catch {
        return undefined;
    }
}

// Splits items into batches under the webhook's body limit. An item
// bigger than the limit goes alone.
function bySize(items: Sized[]): UploadItem[][] {
    const batches: UploadItem[][] = [];
    let size = 0;
    for (const { item, bytes } of items) {
        const last = batches.at(-1);
        if (last === undefined || size + bytes > MAX_BATCH_BYTES) {
            batches.push([item]);
            size = bytes;
        } else {
            last.push(item);
            size += bytes;
        }
    }
    return batches;
}

function bodyOf(batch: Batch): string | undefined {
    try {
        return JSON.stringify({ events: batch.items, ...(batch.dropped > 0 ? { dropped: batch.dropped } : {}) });
    } catch {
        return undefined;
    }
}

export function createUploader(options: UploaderOptions): Uploader {
    const send = options.send ?? fetch;
    const warn = options.warn ?? console.warn;
    const url = `${options.webhookUrl.replace(/\/+$/, "")}/v1/events`;
    const warned = new Set<number>();
    let warnedUnsendable = false;
    let pending: Batch | undefined;
    // Batches taken from the buffer that wait for their turn
    let ready: Batch[] = [];
    let running: Promise<boolean> | undefined;
    let started = false;
    let delay = FIRST_DELAY;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Events JSON can't hold count as dropped, like those a full buffer drops
    function drop(count: number): void {
        addDropped(count);
        if (!warnedUnsendable) {
            warnedUnsendable = true;
            warn("Quard: dropped events that can't be turned into JSON. Check the arguments of your guarded tools.");
        }
    }

    function nextBatch(): Batch | undefined {
        while (ready.length === 0) {
            const events = takeEvents(MAX_BATCH);
            if (events.length === 0) {
                return undefined;
            }
            const now = Date.now();
            const items = events.flatMap((event) => sized(event, options.redactor, now) ?? []);
            if (items.length < events.length) {
                drop(events.length - items.length);
            }
            // The dropped count waits for a batch to go with
            if (items.length > 0) {
                const dropped = takeDropped();
                ready = bySize(items).map((part, index) => ({ items: part, dropped: index === 0 ? dropped : 0 }));
            }
        }
        const [next, ...rest] = ready;
        ready = rest;
        return next;
    }

    // True when the batch is stored, refused for good or can't be sent
    async function sendBatch(batch: Batch): Promise<boolean> {
        const body = bodyOf(batch);
        // Resending would fail again, so its events and the count it carries go on as dropped
        if (body === undefined) {
            drop(batch.items.length + batch.dropped);
            return true;
        }
        try {
            const res = await send(url, {
                method: "POST",
                headers: { authorization: `Bearer ${options.key}`, "content-type": "application/json" },
                body,
            });
            if (res.ok || !worthRetrying(res.status)) {
                if (!res.ok && !warned.has(res.status)) {
                    warned.add(res.status);
                    warn(`Quard: webhook refused events (${res.status}). Check the agent key and the webhook URL.`);
                }
                return true;
            }
        } catch {
            // The backend is unreachable; try again later
        }
        return false;
    }

    async function drain(): Promise<boolean> {
        for (;;) {
            pending ??= nextBatch();
            if (pending === undefined) {
                return true;
            }
            if (!(await sendBatch(pending))) {
                // Whatever waits for the next try arrives late
                pending.items = pending.items.map((item) => ({ ...item, degraded: true }));
                return false;
            }
            pending = undefined;
        }
    }

    function flush(): Promise<boolean> {
        running ??= drain().finally(() => {
            running = undefined;
        });
        return running;
    }

    function schedule(ms: number): void {
        timer = setTimeout(() => void tick(), ms);
        // Uploads never keep a process alive on their own
        timer.unref();
    }

    async function tick(): Promise<void> {
        const reached = await flush();
        delay = reached ? FIRST_DELAY : Math.min(delay * 2, MAX_DELAY);
        if (started) {
            schedule(delay);
        }
    }

    return {
        flush,
        start: () => {
            if (!started) {
                started = true;
                schedule(FIRST_DELAY);
            }
        },
        stop: () => {
            started = false;
            clearTimeout(timer);
        },
    };
}

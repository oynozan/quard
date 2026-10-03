import { MAX_BATCH, newEventId, type Redactor, type UploadItem } from "@quard/shared";
import { takeDropped, takeEvents } from "../core/recorder.ts";
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

// Retried every 1 s to 60 s while the backend is down (PROJECT.md)
const FIRST_DELAY = 1_000;
const MAX_DELAY = 60_000;
// An event older than this when sent is marked degraded
const LATE_MS = 30_000;

// Statuses where a resend could work; any other 4xx refuses the batch for good
function worthRetrying(status: number): boolean {
    return status >= 500 || status === 408 || status === 429;
}

export function createUploader(options: UploaderOptions): Uploader {
    const send = options.send ?? fetch;
    const warn = options.warn ?? console.warn;
    const url = `${options.webhookUrl.replace(/\/+$/, "")}/v1/events`;
    const warned = new Set<number>();
    let pending: Batch | undefined;
    let running: Promise<boolean> | undefined;
    let started = false;
    let delay = FIRST_DELAY;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function nextBatch(): Batch | undefined {
        const events = takeEvents(MAX_BATCH);
        if (events.length === 0) {
            return undefined;
        }
        const now = Date.now();
        const items = events.map((event) => ({
            id: newEventId(),
            event: prepareEvent(event, options.redactor),
            ...(now - Date.parse(event.at) > LATE_MS ? { degraded: true } : {}),
        }));
        return { items, dropped: takeDropped() };
    }

    // True when the batch is done with: stored, or refused for good
    async function sendBatch(batch: Batch): Promise<boolean> {
        try {
            const res = await send(url, {
                method: "POST",
                headers: { authorization: `Bearer ${options.key}`, "content-type": "application/json" },
                body: JSON.stringify({ events: batch.items, ...(batch.dropped > 0 ? { dropped: batch.dropped } : {}) }),
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

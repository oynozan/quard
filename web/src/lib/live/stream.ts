import type { Hub } from "./hub";
import { changeEvent, encode, PING, READY, RETRY } from "./sse";

export const PING_MS = 15_000;
// Events a reader may leave unread before its stream ends
export const QUEUE_MAX = 32;

// The event stream for one browser tab. It ends when the request aborts, the
// reader cancels or stops reading, or the hub loses its listener. The browser
// then reconnects and catches up.
export function liveStream(project: string | undefined, signal: AbortSignal, hub: Hub): ReadableStream<Uint8Array> {
    let finish!: (close: boolean) => void;
    return new ReadableStream<Uint8Array>(
        {
            start(controller) {
                let done = false;
                const end = () => finish(true);
                // A stalled reader would let the queue grow without limit
                const write = (text: string) => {
                    if (done) return;
                    if (Number(controller.desiredSize) > 0) controller.enqueue(encode(text));
                    else end();
                };
                write(RETRY);
                const unsubscribe = hub.subscribe({
                    project,
                    send: (change) => {
                        write(changeEvent(change));
                        // Before any project exists, the first one's change ends the
                        // stream, so the browser reconnects scoped to that project
                        if (project === undefined) end();
                    },
                    ready: () => write(READY),
                    end,
                });
                const timer = setInterval(() => write(PING), PING_MS);
                const onAbort = () => finish(true);
                finish = (close) => {
                    if (done) return;
                    done = true;
                    clearInterval(timer);
                    unsubscribe();
                    signal.removeEventListener("abort", onAbort);
                    if (close) controller.close();
                };
                if (signal.aborted) onAbort();
                else signal.addEventListener("abort", onAbort);
            },
            cancel() {
                finish(false);
            },
        },
        { highWaterMark: QUEUE_MAX },
    );
}

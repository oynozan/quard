import type { Listener, Notice } from "@quard/db";
import { ignore } from "../common/ignore.ts";
import type { ControlTiming } from "../server/timing.ts";

export type OpenListener = (
    url: string,
    heard: (notice: Notice) => void,
    lost: (error: Error) => void,
) => Promise<Listener>;

export type ListenOptions = {
    url: string;
    open: OpenListener;
    heard(notice: Notice): void;
    // Runs after each connect, to catch up on what was missed meanwhile
    back(): void;
    timing: Pick<ControlTiming, "relistenMs" | "relistenMaxMs">;
    log(message: string): void;
};

async function quietly(listener: Listener | undefined): Promise<void> {
    await listener?.close().catch(ignore);
}

// Keeps one LISTEN connection open, retrying with a doubling wait after a failure
export function keepListening(options: ListenOptions): () => Promise<void> {
    let listener: Listener | undefined;
    let timer: NodeJS.Timeout | undefined;
    let stopped = false;
    let delay = options.timing.relistenMs;

    function retry(): void {
        if (stopped) {
            return;
        }
        timer = setTimeout(() => void start(), delay);
        timer.unref();
        delay = Math.min(delay * 2, options.timing.relistenMaxMs);
    }

    function lost(error: Error): void {
        options.log(`control: lost the Postgres listen connection: ${error.message}`);
        void quietly(listener);
        listener = undefined;
        retry();
    }

    async function start(): Promise<void> {
        try {
            const opened = await options.open(options.url, options.heard, lost);
            if (stopped) {
                await quietly(opened);
                return;
            }
            listener = opened;
            delay = options.timing.relistenMs;
            options.back();
        } catch (error) {
            options.log(`control: could not listen on Postgres: ${(error as Error).message}`);
            retry();
        }
    }

    void start();
    return async () => {
        stopped = true;
        clearTimeout(timer);
        await quietly(listener);
        listener = undefined;
    };
}

export type Worker = {
    stop: () => void;
};

const KEEP_ALIVE_MS = 60_000;

// Keeps the process alive until stopped. Jobs come in M5.
export function startWorker(log: (message: string) => void = console.log): Worker {
    const timer = setInterval(() => {}, KEEP_ALIVE_MS);
    log("worker started");
    return {
        stop() {
            clearInterval(timer);
            log("worker stopped");
        },
    };
}

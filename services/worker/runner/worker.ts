import { messageOf, type JobDeps } from "../jobs/deps.ts";
import { startCleanup } from "./cleanup.ts";
import { runNextJob } from "./jobs.ts";

export type Worker = {
    // Resolves once the jobs in flight finished
    stop: () => Promise<void>;
};

export type WorkerOptions = JobDeps & {
    log?: (message: string) => void;
    // How long to wait when no job is due
    pollMs?: number;
    // How often the retention cleanup runs
    cleanupEveryMs?: number;
};

// At most this many jobs run at once
const SLOTS = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Claims and runs incident jobs, and runs the retention cleanup, until stopped
export function startWorker(options: WorkerOptions): Worker {
    const { log = console.log, pollMs = 1_000 } = options;
    const cleanup = startCleanup({ db: options.db, log, everyMs: options.cleanupEveryMs });
    let stopped = false;
    const loop = async () => {
        while (!stopped) {
            try {
                const line = await runNextJob(options);
                if (line !== undefined) {
                    log(line);
                    continue;
                }
            } catch (error) {
                log(`could not claim a job: ${messageOf(error)}`);
            }
            await sleep(pollMs);
        }
    };
    const slots = Array.from({ length: SLOTS }, loop);
    log("worker started");
    return {
        async stop() {
            stopped = true;
            await Promise.all([...slots, cleanup.stop()]);
            log("worker stopped");
        },
    };
}

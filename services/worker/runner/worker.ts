import { messageOf, type JobDeps } from "../jobs/deps.ts";
import { runNextJob } from "./jobs.ts";

export type Worker = {
    // Resolves once the jobs in flight finished
    stop: () => Promise<void>;
};

export type WorkerOptions = JobDeps & {
    log?: (message: string) => void;
    // How long to wait when no job is due
    pollMs?: number;
};

// At most this many jobs run at once
const SLOTS = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Claims and runs incident jobs until stopped
export function startWorker(options: WorkerOptions): Worker {
    const { log = console.log, pollMs = 1_000 } = options;
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
            await Promise.all(slots);
            log("worker stopped");
        },
    };
}

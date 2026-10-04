import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { beatWorker } from "@quard/db";
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

// How often the worker records that it runs, so the dashboard can tell it stopped
export const BEAT_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Claims and runs incident jobs until stopped
export function startWorker(options: WorkerOptions): Worker {
    const { log = console.log, pollMs = 1_000 } = options;
    let stopped = false;
    const info = { id: randomUUID(), host: hostname(), pid: process.pid, startedAt: new Date() };
    const beat = () =>
        beatWorker(options.db, info).catch((error: unknown) =>
            log(`could not save the heartbeat: ${messageOf(error)}`),
        );
    let beating = beat();
    const beats = setInterval(() => (beating = beat()), BEAT_MS);
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
            clearInterval(beats);
            await Promise.all([...slots, beating]);
            log("worker stopped");
        },
    };
}

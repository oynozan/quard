import { startWorker } from "./runner/worker.ts";

const worker = startWorker();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => worker.stop());
}

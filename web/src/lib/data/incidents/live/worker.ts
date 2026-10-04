// Workers check in every 10 s, so one seen in the last 30 s is running
const SEEN_MS = 30_000;

export function workerRunning(seen: Date | null, now: number): boolean {
    return seen !== null && now - seen.getTime() <= SEEN_MS;
}

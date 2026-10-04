import { cleanExpired, type CleanupCounts, type Db } from "@quard/db";
import { messageOf } from "../jobs/deps.ts";

// The retention cleanup runs when the worker starts, then this often
export const CLEANUP_EVERY_MS = 60 * 60_000;

export type CleanupLoop = {
    // Resolves once a pass in flight stopped between batches
    stop: () => Promise<void>;
};

export type CleanupOptions = {
    db: Db;
    log: (message: string) => void;
    everyMs?: number;
};

const NAMES: Record<keyof CleanupCounts, string> = {
    runs: "runs",
    approvals: "approval requests",
    messageRecords: "message records",
    runCounters: "run counters",
    dayCounters: "day counters",
    fleetUses: "fleet uses",
    fleetValues: "fleet values",
    connections: "connections",
    grants: "revoked grants",
};

// "deleted 3 runs, 12 message records", leaving out kinds with none
export function cleanupLine(deleted: CleanupCounts): string {
    const parts = Object.entries(NAMES)
        .map(([kind, name]) => [deleted[kind as keyof CleanupCounts], name] as const)
        .filter(([count]) => count > 0)
        .map(([count, name]) => `${count} ${name}`);
    return parts.length === 0 ? "retention cleanup: nothing expired" : `retention cleanup: deleted ${parts.join(", ")}`;
}

// Deletes expired data now and then every everyMs, until stopped. Several
// workers may run it at once: a row two of them pick is deleted once.
export function startCleanup({ db, log, everyMs = CLEANUP_EVERY_MS }: CleanupOptions): CleanupLoop {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pass: Promise<void> = Promise.resolve();
    const run = () => {
        pass = cleanExpired(db, { stopped: () => stopped })
            .then(
                (result) => log(cleanupLine(result.deleted)),
                (error: unknown) => log(`retention cleanup failed: ${messageOf(error)}`),
            )
            .finally(() => {
                if (!stopped) {
                    timer = setTimeout(run, everyMs);
                }
            });
    };
    run();
    return {
        async stop() {
            stopped = true;
            clearTimeout(timer);
            await pass;
        },
    };
}

import type { Db } from "../connect/connect.ts";
import { CHANNELS, notify } from "./channels.ts";

// Past this many runs the dashboard just refreshes, so the ids are left out
export const LIVE_RUNS = 20;
// Run notices go out at most this often, merged per project
export const LIVE_GAP_MS = 250;

export function approvalsNotice(projectId: string): string {
    return JSON.stringify({ project: projectId, topic: "approvals" });
}

export function runsNotice(projectId: string, runIds: string[]): string {
    const runs = runIds.length <= LIVE_RUNS ? { runs: runIds } : {};
    return JSON.stringify({ project: projectId, topic: "runs", ...runs });
}

export type RunNotices = {
    // Notes runs that changed. Their notice goes out within the gap.
    changed(projectId: string, runIds: string[]): void;
    // Sends what is still waiting
    flush(): Promise<void>;
};

// NOTIFY takes a database-wide lock at commit, so run notices are sent on
// their own, after the ingest commits, and merged instead of one per batch
export function runNotices(db: Db, failed: (error: Error) => void, gapMs = LIVE_GAP_MS): RunNotices {
    const waiting = new Map<string, Set<string>>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = async () => {
        clearTimeout(timer);
        timer = undefined;
        const sends = [...waiting].map(([projectId, runIds]) =>
            notify(db, CHANNELS.live, runsNotice(projectId, [...runIds])).catch(failed),
        );
        waiting.clear();
        await Promise.all(sends);
    };

    return {
        changed(projectId, runIds) {
            const runs = waiting.get(projectId) ?? new Set<string>();
            for (const id of runIds) runs.add(id);
            waiting.set(projectId, runs);
            timer ??= setTimeout(() => void flush(), gapMs);
        },
        flush,
    };
}

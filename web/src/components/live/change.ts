// One change the /api/live stream sends
export type LiveChange = { topic: string; runs?: string[] };

// Reads an event's data, or null when it is not a change
export function parseChange(data: string): LiveChange | null {
    try {
        const change: unknown = JSON.parse(data);
        if (typeof change !== "object" || change === null) return null;
        const { topic, runs } = change as Record<string, unknown>;
        if (typeof topic !== "string") return null;
        return Array.isArray(runs) ? { topic, runs: runs.map(String) } : { topic };
    } catch {
        return null;
    }
}

// A run page only cares about its own run; every other page refreshes
export function mattersHere(change: LiveChange, pathname: string): boolean {
    const run = /^\/runs\/([^/]+)\/?$/.exec(pathname)?.[1];
    if (!run || change.topic !== "runs" || !change.runs) return true;
    return change.runs.includes(run);
}

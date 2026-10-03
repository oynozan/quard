import type { SearchMatch } from "@/lib/data/search";
import type { RunRow } from "@/lib/data/runs/types";

export type RunGroup = {
    runId: string;
    run: RunRow;
    matches: SearchMatch[];
};

// Groups matches by run in match order, leaving out a match whose run is gone
export function groupByRun(matches: SearchMatch[], runs: RunRow[]): RunGroup[] {
    const byId = new Map(runs.map((run) => [run.id, run]));
    const groups = new Map<string, RunGroup>();
    for (const match of matches) {
        const run = byId.get(match.runId);
        if (!run) continue;
        let group = groups.get(match.runId);
        if (!group) {
            group = { runId: match.runId, run, matches: [] };
            groups.set(match.runId, group);
        }
        group.matches.push(match);
    }
    return [...groups.values()];
}

// Builds the page address for a query. An empty query clears it.
export function searchHref(query: string): string {
    const text = query.trim();
    return text ? `/search?q=${encodeURIComponent(text)}` : "/search";
}

// Reads ?q= from the page's search params. Only the first value counts.
export function readQuery(params: Record<string, string | string[] | undefined>): string {
    const value = params.q;
    const text = Array.isArray(value) ? value[0] : value;
    return (text ?? "").trim().slice(0, 300);
}

import { runsPerHour } from "../activity";
import { createRng, isRunId, randomHex, NOW, HOUR } from "../rng";
import { RunBuilder, type BuiltRun } from "./build/builder";
import { toDetail, type RunLinks } from "./detail";
import { planFor, planFromId } from "./generate/plan";
import { generateRun } from "./generate/run";
import { PINNED_RUNS, pinnedRun } from "./scripts/registry";
import type { RunDetail, RunRow } from "./types";

// Hours of generated runs in the list. Older runs show up only when something points at them.
const WINDOW_HOURS = 6;

type Entry = { id: string; startedAt: number };

export type CatalogRun = { built: BuiltRun; detail: RunDetail };

let entries: Entry[] | null = null;
const cache = new Map<string, CatalogRun>();
const MAX_EXTRA = 300;
const LIVE_OFFSETS = [7_000, 19_000, 26_000];

// Generated runs follow the overview's runs-per-hour chart, minus the pinned runs in each hour.
function catalogEntries(): Entry[] {
    if (entries) return entries;
    const rng = createRng(1701);
    const perHour = runsPerHour();
    const list: Entry[] = PINNED_RUNS.map((run) => ({ id: run.id, startedAt: run.startedAt }));
    for (let hour = 0; hour < WINDOW_HOURS; hour++) {
        const end = NOW - hour * HOUR;
        const pinned = PINNED_RUNS.filter((run) => run.startedAt <= end && run.startedAt > end - HOUR).length;
        const count = Math.max(0, perHour[perHour.length - 1 - hour] - pinned);
        for (let i = 0; i < count; i++) {
            list.push({ id: randomHex(rng, 32), startedAt: end - 1 - Math.floor(rng() * (HOUR - 1)) });
        }
    }
    // The three newest generated runs started seconds ago, so they are still running at NOW.
    const pinnedIds = new Set(PINNED_RUNS.map((run) => run.id));
    const sorted = list.sort((a, b) => b.startedAt - a.startedAt);
    sorted
        .filter((entry) => !pinnedIds.has(entry.id))
        .slice(0, LIVE_OFFSETS.length)
        .forEach((entry, index) => (entry.startedAt = NOW - LIVE_OFFSETS[index]));
    entries = sorted.sort((a, b) => b.startedAt - a.startedAt);
    return entries;
}

function build(id: string): { built: BuiltRun; links: RunLinks } {
    const pinned = pinnedRun(id);
    if (pinned) {
        const builder = new RunBuilder(id, pinned.startedAt);
        pinned.write(builder);
        return { built: builder.finish(), links: { incidentId: pinned.incidentId, approvalId: pinned.approvalId } };
    }
    const entry = catalogEntries().find((item) => item.id === id);
    const plan = entry ? planFor(id, entry.startedAt) : planFromId(id);
    return { built: generateRun(plan), links: { incidentId: null, approvalId: null } };
}

// Any 32-hex run id gives a run. Listed runs and pinned runs keep their place in time.
export function catalogRun(runId: string): CatalogRun | null {
    const id = runId.toLowerCase();
    if (!isRunId(id)) return null;
    const hit = cache.get(id);
    if (hit) return hit;
    const { built, links } = build(id);
    const run = { built, detail: toDetail(built, links) };
    const listed = catalogEntries().some((item) => item.id === id);
    if (!listed && cache.size > MAX_EXTRA + catalogEntries().length) cache.clear();
    cache.set(id, run);
    return run;
}

// Every listed run, newest first.
export function catalogRuns(): CatalogRun[] {
    return catalogEntries().flatMap((entry) => {
        const run = catalogRun(entry.id);
        return run ? [run] : [];
    });
}

export function catalogRows(): RunRow[] {
    return catalogRuns().map((run) => run.detail.summary);
}

import "server-only";
import { chunkQueue, countOpenChunks, labelStats, reviewedChunks, type ChunkItem, type LabelStat } from "@quard/db";
import { isRiskyLabel, LABEL_NAMES } from "@quard/shared";
import { projectScope } from "../scope";
import type { ContentLabelsData, LabelStatRow, ReviewChunk } from "./types";

// How many unsure chunks the page lists at once
export const QUEUE_SIZE = 50;
const REVIEWED_SIZE = 20;
// Chances the drawer shows
const TOP = 3;

export function reviewChunkOf(item: ChunkItem): ReviewChunk {
    const chances = Object.entries(item.probabilities)
        .map(([label, chance]) => ({ label, chance }))
        .sort((a, b) => b.chance - a.chance)
        .slice(0, TOP);
    return {
        eventId: item.eventId,
        runId: item.runId,
        agent: item.agent,
        tool: item.tool,
        origin: item.origin,
        text: item.text,
        label: item.label,
        chances,
        confidence: item.confidence,
        at: item.at.getTime(),
        fallback: item.fallback && {
            state: item.fallback.state,
            label: item.fallback.label,
            reason: item.fallback.reason,
        },
        review: item.review && { label: item.review.label, by: item.review.by, at: item.review.at.getTime() },
    };
}

// Every fixed label gets a row, so the table stays drawn before any review
export function statRows(stats: LabelStat[]): LabelStatRow[] {
    const found = new Map(stats.map((stat) => [stat.label, stat]));
    const names = [
        ...LABEL_NAMES,
        ...stats.map((stat) => stat.label).filter((name) => !LABEL_NAMES.includes(name as never)),
    ];
    return names.map((label) => {
        const stat = found.get(label);
        return {
            label,
            risky: isRiskyLabel(label),
            open: stat?.open ?? 0,
            reviewed: stat?.reviewed ?? 0,
            right: stat?.right ?? 0,
            flagged: stat?.flagged ?? 0,
            flaggedRight: stat?.flaggedRight ?? 0,
        };
    });
}

// The review queue, the latest reviews and the counts per label
export async function getContentLabels(): Promise<ContentLabelsData> {
    const scope = await projectScope();
    const now = Date.now();
    if (!scope) return { now, open: 0, queue: [], reviewed: [], stats: statRows([]) };
    const { db, project } = scope;
    const [queue, open, reviewed, stats] = await Promise.all([
        chunkQueue(db, project.id, QUEUE_SIZE),
        countOpenChunks(db, project.id),
        reviewedChunks(db, project.id, REVIEWED_SIZE),
        labelStats(db, project.id),
    ]);
    return {
        now,
        open,
        queue: queue.map(reviewChunkOf),
        reviewed: reviewed.map(reviewChunkOf),
        stats: statRows(stats),
    };
}

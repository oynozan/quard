import type { FallbackState } from "../../schema/chunk-labels.ts";

export type { FallbackState } from "../../schema/chunk-labels.ts";

// What the AI fallback said about a chunk labeled none
export type ChunkFallback = {
    state: FallbackState;
    label: string | null;
    reason: string | null;
    error: string | null;
};

// A person's review of a chunk's label
export type ChunkReview = { label: string; by: string; at: Date };

// A labeled chunk of public content, as the review queue shows it
export type ChunkItem = {
    eventId: string;
    runId: string;
    stepId: string;
    agent: string;
    tool: string;
    origin: string;
    detector: string;
    chunk: number;
    text: string;
    label: string;
    probabilities: Record<string, number>;
    confidence: number;
    score: number;
    injection: number | null;
    at: Date;
    fallback: ChunkFallback | null;
    review: ChunkReview | null;
};

// Reviewed examples per label the detector picked
export type LabelStat = {
    label: string;
    open: number;
    reviewed: number;
    // Reviews that kept the label
    right: number;
    // Reviewed chunks whose risk reached the flag threshold, and those kept
    flagged: number;
    flaggedRight: number;
};

// A chunk the worker claimed for the AI fallback
export type FallbackJob = { projectId: string; eventId: string; text: string; attempts: number };

// What the fallback gives back: a label, an error, or null without a provider key
export type FallbackResult =
    { label: string; reason: string; model: string; costUsd: number } | { error: string } | null;

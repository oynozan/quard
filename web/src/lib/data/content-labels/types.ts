// One label and its chance, from 0 to 1
export type LabelChance = { label: string; chance: number };

// A labeled chunk of public content, as the review queue shows it
export type ReviewChunk = {
    eventId: string;
    runId: string;
    agent: string;
    tool: string;
    origin: string;
    text: string;
    label: string;
    // The likeliest labels, most likely first
    chances: LabelChance[];
    confidence: number;
    at: number;
    fallback: { state: "pending" | "done" | "skipped" | "failed"; label: string | null; reason: string | null } | null;
    review: { label: string; by: string; at: number } | null;
};

// Reviewed examples per label the detector picked
export type LabelStatRow = {
    label: string;
    risky: boolean;
    open: number;
    reviewed: number;
    right: number;
    flagged: number;
    flaggedRight: number;
};

export type ContentLabelsData = {
    now: number;
    // Chunks nobody reviewed yet, all of them
    open: number;
    // The least sure of them, first
    queue: ReviewChunk[];
    reviewed: ReviewChunk[];
    stats: LabelStatRow[];
};

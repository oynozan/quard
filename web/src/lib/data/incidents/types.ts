import type { MissingGuard } from "@quard/db";
import type { RunRow } from "../runs/types";
import type { Incident, IncidentCategory, PathNode, ReplayStatus } from "../types";

export type { MissingGuard };

// The three kinds of bad handoff the root-cause finder tells apart.
export type HandoffFault = "wrong information sent" | "constraint dropped" | "correct message misread";

export type Verdict = {
    category: IncidentCategory;
    // The guard that would have stopped it. Null when the guards worked.
    missingGuard: MissingGuard | null;
    // Needs messages between agents (M4), so it is always null for now
    handoffFault: HandoffFault | null;
    // The agent versions involved, so the incident ties to the version that caused it.
    versions: { agent: string; version: string }[];
};

export type ReplayCount = { runs: number; harmful: number };

export type ReplayRound = {
    round: number;
    withContent: ReplayCount;
    withoutContent: ReplayCount;
    // Counts so far, after this round.
    totalWith: ReplayCount;
    totalWithout: ReplayCount;
    // One-sided Fisher test on the counts so far. Confirmed below the threshold.
    pValue: number;
    costUsd: number;
    finishedAt: number;
};

export type Replay = {
    status: ReplayStatus;
    rounds: ReplayRound[];
    threshold: number;
    // The exact recorded model and settings are reused.
    model: string;
    // A rerun counts as harmful when it asks for this same call with the same key value.
    harmfulCall: string;
    // What the "without" reruns leave out.
    removedContent: string;
    // Every model call the finder made so far, AI reviewer included.
    costUsd: number;
    capUsd: number;
    // Why replay is limited or failed, in plain words
    reason: string | null;
};

export type ReviewerNote = {
    model: string;
    costUsd: number;
    writtenAt: number;
    paragraphs: string[];
};

// What the root-cause finder found, and what came after the verdict
export type IncidentFindings = {
    verdict: Verdict;
    // From the entry point to the damage, in time order.
    path: PathNode[];
    replay: Replay;
    reviewer: ReviewerNote | null;
    // Why there is no note, shown when reviewer is null
    reviewerStatus: string;
};

export type IncidentDetail = {
    incident: Incident;
    run: RunRow;
    // Why the finder failed. Null while it works or once it found the verdict.
    findError: string | null;
    // Null until the verdict is found
    findings: IncidentFindings | null;
    // The worker is finding the verdict, writing the note or replaying, so the page reloads
    working: boolean;
};

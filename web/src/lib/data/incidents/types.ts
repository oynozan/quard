import type { RunRow } from "../runs/types";
import type { Incident, IncidentCategory, Label, PathNode, ReplayStatus } from "../types";

// The three kinds of bad handoff the root-cause finder tells apart.
export type HandoffFault = "wrong information sent" | "constraint dropped" | "correct message misread";

export type VerdictPoint = {
    stepId: string;
    agent: string;
    title: string;
    detail: string;
    label: Label;
    at: number;
};

export type AcrossAgents = {
    entryAgent: string;
    // The handoff that carried the untrusted content, if one did.
    handoff: { stepId: string; from: string; to: string; summary: string } | null;
    turningAgent: string;
    damageAgent: string;
};

export type Verdict = {
    category: IncidentCategory;
    entryPoint: VerdictPoint;
    turningPoint: VerdictPoint;
    damage: VerdictPoint;
    // The guard that would have stopped it, in plain words. Null when the guards worked.
    missingGuard: string | null;
    // Only when more than one agent took part.
    acrossAgents: AcrossAgents | null;
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
    // A round is running right now.
    inProgress: boolean;
    rounds: ReplayRound[];
    threshold: number;
    maxPerSide: number;
    // The exact recorded model and settings are reused.
    model: string;
    // A rerun counts as harmful when it asks for this same call with the same key value.
    harmfulCall: string;
    // What the "without" reruns leave out.
    removedContent: string;
    // Every model call the finder made so far, AI reviewer included.
    costUsd: number;
    capUsd: number;
    capReached: boolean;
    // "Replay limited: URL-only evidence" when content only came from hosted search.
    limited: boolean;
    limitedReason: string | null;
    startedAt: number;
};

export type ReviewerNote = {
    model: string;
    costUsd: number;
    writtenAt: number;
    paragraphs: string[];
};

export type IncidentDetail = {
    incident: Incident;
    verdict: Verdict;
    // From the entry point to the damage, in time order.
    path: PathNode[];
    replay: Replay;
    reviewer: ReviewerNote | null;
    run: RunRow;
};

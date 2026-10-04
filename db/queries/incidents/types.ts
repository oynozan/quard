// What the worker writes into an incident and the web reads.
// Dates inside JSON are ISO strings.

export type IncidentCategory = "bad input" | "bad reasoning" | "bad handoff" | "broken tool" | "missing guard";

export type Trust = "trusted" | "untrusted";

export type Sensitivity = "internal" | "public";

export type VerdictPlace = { stepId: string; agent: string; at: string };

export type VerdictEntry = VerdictPlace & {
    origin: string;
    trust: Trust;
    sensitivity: Sensitivity;
    flags: string[];
    contentId: string | null;
    key: string | null;
};

// The guard that would have stopped the call. observe: a rule exists but only records.
export type MissingGuard = { text: string; tool: string; guard: string | null; rule: string | null; observe: boolean };

export type TracedValue = {
    key: string;
    generated: boolean;
    appearances: (VerdictPlace & {
        contentId: string;
        origin: string;
        trust: Trust;
        sensitivity: Sensitivity;
        flags: string[];
        match: "value" | "host" | "domain";
    })[];
};

export type HandoffFault = "wrong information sent" | "constraint dropped" | "correct message misread";

// A message, handoff or agent run as a tool, from one agent to another
export type VerdictHandoff = {
    stepId: string;
    kind: "message" | "handoff" | "tool";
    from: string;
    to: string;
    at: string;
    trust: Trust;
    verified: boolean;
};

export type StoredVerdict = {
    category: IncidentCategory;
    entry: VerdictEntry;
    turning: VerdictPlace;
    damage: VerdictPlace & { tool: string; ran: boolean };
    missingGuard: MissingGuard | null;
    values: TracedValue[];
    versions: { agent: string; version: string }[];
    // Only when more than one agent took part. Verdicts stored before
    // these fields lack them: read missing as null.
    acrossAgents: {
        entryAgent: string;
        handoff: VerdictHandoff | null;
        turningAgent: string;
        damageAgent: string;
    } | null;
    handoffFault: HandoffFault | null;
};

export type ReplayCount = { runs: number; harmful: number };

export type StoredRound = {
    with: ReplayCount;
    without: ReplayCount;
    pValue: number;
    costUsd: number;
    finishedAt: string;
};

export type ReplayOutcome = "confirmed" | "not confirmed" | "could not reproduce" | "cap reached";

export type StoredReplay = {
    // The recorded model of the turning point
    model: string;
    // Keys in stored form, e.g. "iban:DE89…3000#<hash>"
    harmfulCall: { tool: string; keys: string[] };
    removed: { contentId: string | null; origin: string; callId: string | null };
    rounds: StoredRound[];
    // Null while running or after an error
    outcome: ReplayOutcome | null;
    // Why replay can't run, in plain words
    limited: string | null;
    error: string | null;
};

export type StoredReview =
    { model: string; costUsd: number; writtenAt: string; paragraphs: string[] } | { error: string };

export type FindState = "pending" | "done" | "failed";
export type ReviewState = "pending" | "done" | "skipped" | "failed";
export type ReplayState = "idle" | "requested" | "running" | "done" | "failed";

export type IncidentRow = {
    id: string;
    runId: string;
    openedAt: Date;
    findState: FindState;
    findError: string | null;
    reviewState: ReviewState;
    replayState: ReplayState;
    verdict: StoredVerdict | null;
    reviewer: StoredReview | null;
    replay: StoredReplay | null;
    spentUsd: number;
    capUsd: number;
    category: IncidentCategory | null;
    damageTool: string | null;
    damageAgent: string | null;
    entryAgent: string | null;
    entryOrigin: string | null;
    entryTrust: Trust | null;
    turningAgent: string | null;
};

// A job the worker claimed, with what it needs to run it
export type ClaimedJob = {
    projectId: string;
    id: string;
    runId: string;
    job: "find" | "review" | "replay";
    attempts: number;
    spentUsd: number;
    capUsd: number;
    verdict: StoredVerdict | null;
    replay: StoredReplay | null;
};

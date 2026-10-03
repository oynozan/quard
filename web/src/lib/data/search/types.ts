import type { Label, ValueKind } from "../types";

export type SearchKind = ValueKind | "agent" | "tool";

export type SearchMatchKind = "exact" | "inside" | "host" | "domain" | "name" | "text";

export type SearchMatch = {
    runId: string;
    stepId: string;
    agent: string;
    tool: string;
    // The argument name, or "output", "brief", "message", "input" or "memory".
    field: string;
    // Masked when sensitive: "DE89…3000", "r…@claims-desk.io".
    value: string;
    kind: SearchKind;
    label: Label;
    at: number;
    // Sensitive values match by keyed hash, never by their text.
    byHash: boolean;
    match: SearchMatchKind;
};

export type SearchResult = {
    query: string;
    kind: SearchKind;
    byHash: boolean;
    // The first 12 characters of the keyed hash, for sensitive queries.
    hash: string | null;
    // The query as the page may show it. Masked when sensitive.
    shown: string;
    // Newest first.
    matches: SearchMatch[];
    total: number;
    runs: number;
    truncated: boolean;
};

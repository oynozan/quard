import type { RunRow } from "../runs/types";
import type { Label } from "../types";

// What a query was searched as, where a host counts as a domain
export type SearchKind = "iban" | "email" | "url" | "domain" | "path" | "id" | "agent" | "tool";

export type SearchMatchKind = "exact" | "inside" | "host" | "domain" | "name";

export type SearchMatch = {
    runId: string;
    stepId: string;
    agent: string;
    // The step's tool or model, empty for an agent's start or a step not stored yet
    tool: string;
    // The argument path, "arguments", "input", "output", "content", "agent" or "tool"
    field: string;
    // The matched value, masked for an IBAN or email
    value: string;
    // Null for names, and for a value no content held before the call sent it
    label: Label | null;
    at: number;
    match: SearchMatchKind;
};

export type SearchResult = {
    query: string;
    kind: SearchKind;
    // Sensitive values match by keyed hash, never by their text
    byHash: boolean;
    // The query as the page may show it, masked when sensitive
    shown: string;
    // The newest matches, newest first
    matches: SearchMatch[];
    // The runs the matches are in, for the group headers
    runRows: RunRow[];
    total: number;
    runs: number;
    truncated: boolean;
};

// What the search page shows
export type SearchState =
    | { state: "no-runs" }
    | { state: "idle" }
    // A card number, an IBAN or email without the hash key, or no value or name
    | { state: "card" | "hash-off" | "nothing" }
    | { state: "searched"; result: SearchResult };

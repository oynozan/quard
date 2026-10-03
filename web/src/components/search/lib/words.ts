import type { SearchKind, SearchMatch } from "@/lib/data/search";

// How the page names each kind of query
export const KIND_WORD: Record<SearchKind, string> = {
    iban: "IBAN",
    email: "Email address",
    url: "URL",
    domain: "Domain",
    path: "File path",
    id: "ID",
    agent: "Agent",
    tool: "Tool",
};

// A short marker for how a value matched, with "by hash" said once in the summary instead
const MATCH_WORD: Record<SearchMatch["match"], string> = {
    exact: "exact",
    inside: "inside a value",
    host: "same host",
    domain: "same domain",
    name: "by name",
};

export function matchWord(match: SearchMatch): string {
    return MATCH_WORD[match.match];
}

// The step a match belongs to, named for the table's first column
export function stepName(match: SearchMatch): string {
    if (match.tool) return match.tool;
    if (match.field === "agent") return "Agent started";
    return "Step";
}

export function plural(count: number, one: string, many: string): string {
    return count === 1 ? one : many;
}

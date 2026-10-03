import { maskValue } from "../../mask";
import { agentNames } from "../agents/roster";
import { TOOLS } from "../guards/tools";
import { keyedHash } from "../values/hash";
import { hostOf, mainDomain, normalize } from "../values/kinds";
import { classifyQuery, isSensitive, valueIndex, type IndexEntry } from "./value-index";
import type { ValueKind } from "../types";
import type { SearchKind, SearchMatch, SearchMatchKind, SearchResult } from "./types";

const LIMIT = 200;

// Queries to offer on an empty search page. Sensitive values are left out on purpose.
export const SEARCH_EXAMPLES: { query: string; kind: SearchKind }[] = [
    { query: "supplier-portal.example", kind: "domain" },
    { query: "claims-desk.io", kind: "domain" },
    { query: "INV-20931", kind: "id" },
    { query: "pay_invoice", kind: "tool" },
    { query: "researcher", kind: "agent" },
    { query: "/srv/exports/contacts-2026-10.csv", kind: "path" },
];

function matchOf(entry: IndexEntry, kind: SearchKind, query: string, hash: string | null): SearchMatchKind | null {
    if (kind === "agent" || kind === "tool") {
        return entry.kind === kind && entry.clear === query.toLowerCase() ? "name" : null;
    }
    if (entry.kind === "agent" || entry.kind === "tool") return null;
    if (hash) return entry.hash === hash ? (entry.inside ? "inside" : "exact") : null;
    const valueKind = kind as ValueKind;
    const norm = normalize(query, valueKind);
    if (entry.clear === norm) return entry.inside ? "inside" : "exact";
    if (kind === "url" || kind === "domain") {
        const host = hostOf(query, valueKind);
        if (host && entry.host === host) return "host";
        if (host && entry.domain === mainDomain(host)) return "domain";
        return null;
    }
    if (kind === "text") return entry.clear?.includes(norm) ? "text" : null;
    return null;
}

// Every run that touched a value: a domain, URL, email, IBAN, card, path, ID, agent or tool.
// IBANs, cards and emails are hashed with the install key and matched by hash.
export async function searchRuns(query: string): Promise<SearchResult> {
    const text = query.trim();
    const kind = classifyQuery(
        text,
        agentNames(),
        TOOLS.map((tool) => tool.name),
    );
    const sensitive = isSensitive(kind);
    const hash = sensitive ? keyedHash(normalize(text, kind as ValueKind)) : null;
    if (!text || (kind === "text" && text.length < 3)) {
        return {
            query: text,
            kind,
            byHash: false,
            hash: null,
            shown: text,
            matches: [],
            total: 0,
            runs: 0,
            truncated: false,
        };
    }
    const seen = new Set<string>();
    const matches: SearchMatch[] = [];
    for (const entry of valueIndex()) {
        const match = matchOf(entry, kind, text, hash);
        if (!match) continue;
        const key = `${entry.runId}:${entry.stepId}:${entry.field}:${entry.shown}`;
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({
            runId: entry.runId,
            stepId: entry.stepId,
            agent: entry.agent,
            tool: entry.tool,
            field: entry.field,
            value: entry.shown,
            kind: entry.kind,
            label: entry.label,
            at: entry.at,
            byHash: entry.hash !== null && hash !== null,
            match,
        });
    }
    matches.sort((a, b) => b.at - a.at);
    return {
        query: text,
        kind,
        byHash: sensitive,
        hash: hash ? hash.slice(0, 12) : null,
        shown: sensitive ? maskValue(text) : text,
        matches: matches.slice(0, LIMIT),
        total: matches.length,
        runs: new Set(matches.map((match) => match.runId)).size,
        truncated: matches.length > LIMIT,
    };
}

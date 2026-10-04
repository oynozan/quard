import { findName, findValue, hasRuns, listRuns, searchKeys, type Db } from "@quard/db";
import { runRowsOf } from "../runs/live/rows";
import { projectScope } from "../scope";
import { KIND_OF, nameMatches, valueMatches } from "./matches";
import type { SearchResult, SearchState } from "./types";

// Search lists the newest 50 matches
const LIMIT = 50;

type Found = Omit<SearchResult, "query" | "runRows" | "truncated">;

// Runs where an agent by that name made a step, else where a tool by that name was called
async function byName(db: Db, projectId: string, name: string): Promise<Found | null> {
    const agents = await findName(db, projectId, { agent: name, limit: LIMIT });
    if (agents.total > 0) {
        const matches = nameMatches(agents.matches, "agent");
        return { kind: "agent", byHash: false, shown: name, total: agents.total, runs: agents.runs, matches };
    }
    const tools = await findName(db, projectId, { tool: name, limit: LIMIT });
    if (tools.total > 0) {
        const matches = nameMatches(tools.matches, "tool");
        return { kind: "tool", byHash: false, shown: name, total: tools.total, runs: tools.runs, matches };
    }
    return null;
}

// Every run that read or sent a value, or where an agent or tool by that name ran
export async function searchRuns(query: string): Promise<SearchState> {
    const scope = await projectScope();
    if (!scope || !(await hasRuns(scope.db, scope.project.id))) return { state: "no-runs" };
    const text = query.trim();
    if (!text) return { state: "idle" };
    const { db, project } = scope;
    let found = await byName(db, project.id, text);
    if (!found) {
        const value = searchKeys(text, process.env.QUARD_HASH_KEY, project.id);
        if (!value) return { state: "nothing" };
        if (value.status === "not-searchable") return { state: "card" };
        if (value.status === "needs-hash-key") return { state: "hash-off" };
        const hits = await findValue(db, project.id, value.keys, { limit: LIMIT });
        found = {
            kind: KIND_OF[value.kind],
            byHash: value.kind === "iban" || value.kind === "email",
            shown: value.shown,
            total: hits.total,
            runs: hits.runs,
            matches: valueMatches(hits.matches, value.keys),
        };
    }
    const runIds = [...new Set(found.matches.map((match) => match.runId))];
    const runs = await listRuns(db, project.id, { runIds });
    const runRows = await runRowsOf(db, project.id, runs, Date.now());
    return {
        state: "searched",
        result: { query: text, ...found, runRows, truncated: found.total > found.matches.length },
    };
}

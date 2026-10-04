import type { NameMatchRow, SearchKeys, ValueMatchRow } from "@quard/db";
import { flatten, parseKey } from "../runs/live/values";
import type { SearchKind, SearchMatch, SearchMatchKind } from "./types";

type ValueKind = Extract<SearchKeys, { status: "ready" }>["kind"];

export const KIND_OF: Record<ValueKind, SearchKind> = {
    iban: "iban",
    email: "email",
    url: "url",
    host: "domain",
    path: "path",
    id: "id",
    wallet: "wallet",
};

// The run's first step by that agent, or its first call of that tool
export function nameMatches(rows: NameMatchRow[], kind: "agent" | "tool"): SearchMatch[] {
    return rows.map((row) => ({
        runId: row.runId,
        stepId: row.stepId,
        agent: row.agent,
        tool: kind === "tool" ? row.name : "",
        field: kind,
        value: kind === "tool" ? row.name : row.agent,
        label: null,
        at: row.at.getTime(),
        match: "name",
    }));
}

function contentField(kind: "model_call" | "tool_call" | null): string {
    if (kind === "model_call") return "input";
    return kind === "tool_call" ? "output" : "content";
}

// The first argument holding the value, case aside since ID keys are lowercase
function argumentWith(args: unknown, shown: string): { field: string; whole: boolean } {
    const value = shown.toLowerCase();
    const leaf = flatten(args).find((item) => item.value.toLowerCase().includes(value));
    if (!leaf) return { field: "arguments", whole: true };
    return { field: leaf.path, whole: leaf.value.toLowerCase() === value };
}

// Keys come strongest first, the value itself and then its host and domain
export function valueMatches(rows: ValueMatchRow[], keys: string[]): SearchMatch[] {
    return rows.map((row) => {
        const key = row.matched[0];
        const { shown } = parseKey(key);
        const exact = key === keys[0];
        const near: SearchMatchKind = key.startsWith("host:") ? "host" : "domain";
        const base = {
            runId: row.runId,
            stepId: row.stepId,
            agent: row.agent,
            value: shown,
            label: row.label,
            at: row.at.getTime(),
        };
        if (row.source === "content") {
            return {
                ...base,
                tool: row.stepName ?? "",
                field: contentField(row.stepKind),
                match: exact ? "exact" : near,
            };
        }
        const { field, whole } = argumentWith(row.arguments, shown);
        return { ...base, tool: row.stepName, field, match: exact ? (whole ? "exact" : "inside") : near };
    });
}

import { maskValue } from "../../mask";
import { catalogRuns } from "../runs/catalog";
import { keyedHash } from "../values/hash";
import { classify, extractValues, hostOf, mainDomain, normalize } from "../values/kinds";
import type { CatalogRun } from "../runs/catalog";
import type { Label, ValueKind } from "../types";
import type { SearchKind } from "./types";

const SENSITIVE: ReadonlySet<SearchKind> = new Set<SearchKind>(["iban", "email", "card"]);

// One searchable value. Sensitive values keep only a keyed hash and a mask.
export type IndexEntry = {
    runId: string;
    stepId: string;
    agent: string;
    tool: string;
    field: string;
    kind: SearchKind;
    shown: string;
    hash: string | null;
    clear: string | null;
    host: string | null;
    domain: string | null;
    label: Label;
    at: number;
    inside: boolean;
};

export function isSensitive(kind: SearchKind): boolean {
    return SENSITIVE.has(kind);
}

function entry(
    base: Omit<IndexEntry, "kind" | "shown" | "hash" | "clear" | "host" | "domain" | "inside">,
    raw: string,
    kind: ValueKind,
    inside: boolean,
): IndexEntry {
    const norm = normalize(raw, kind);
    const host = hostOf(raw, kind);
    const sensitive = isSensitive(kind);
    return {
        ...base,
        kind,
        shown: sensitive ? maskValue(raw) : raw,
        hash: sensitive ? keyedHash(norm) : null,
        clear: sensitive ? null : norm,
        host,
        domain: host ? mainDomain(host) : null,
        inside,
    };
}

function fieldOf(kind: string): string {
    if (kind === "handoff") return "brief";
    if (kind === "message") return "message";
    if (kind === "model_call") return "input";
    if (kind.startsWith("memory")) return "memory";
    return "output";
}

function entriesOf(run: CatalogRun): IndexEntry[] {
    const runId = run.detail.summary.id;
    const steps = new Map(run.detail.steps.map((step) => [step.id, step]));
    const out: IndexEntry[] = [];
    // Values the agents read: tool outputs, user input, briefs, messages and memory.
    for (const value of run.built.index) {
        const step = steps.get(value.stepId);
        if (!step) continue;
        const base = {
            runId,
            stepId: step.id,
            agent: value.agent,
            tool: step.name,
            field: fieldOf(step.kind),
            label: value.label,
            at: value.at,
        };
        out.push(entry(base, value.raw, value.kind, false));
    }
    // Values that went into calls, and typed values found inside them.
    for (const arg of run.built.rawArgs) {
        if (arg.kind === "amount") continue;
        const base = {
            runId,
            stepId: arg.stepId,
            agent: arg.agent,
            tool: arg.tool,
            field: arg.name,
            label: arg.label,
            at: arg.at,
        };
        if (arg.kind !== "text") out.push(entry(base, arg.raw, arg.kind, false));
        for (const inner of extractValues(arg.raw)) {
            if (inner.raw !== arg.raw) out.push(entry(base, inner.raw, inner.kind, true));
        }
    }
    // Agent and tool names, once per run.
    const named = new Set<string>();
    for (const step of run.detail.steps) {
        const keys: [SearchKind, string][] = [["agent", step.agent]];
        if (step.kind === "tool_call") keys.push(["tool", step.name]);
        for (const [kind, name] of keys) {
            if (named.has(`${kind}:${name}`)) continue;
            named.add(`${kind}:${name}`);
            out.push({
                runId,
                stepId: step.id,
                agent: step.agent,
                tool: step.kind === "tool_call" ? step.name : "",
                field: kind,
                kind,
                shown: name,
                hash: null,
                clear: name.toLowerCase(),
                host: null,
                domain: null,
                label: step.context,
                at: step.startedAt,
                inside: false,
            });
        }
    }
    return out;
}

let cached: IndexEntry[] | null = null;

// The value index for search across every listed run.
export function valueIndex(): IndexEntry[] {
    if (!cached) cached = catalogRuns().flatMap(entriesOf);
    return cached;
}

export function classifyQuery(query: string, agents: string[], tools: string[]): SearchKind {
    const lower = query.trim().toLowerCase();
    if (agents.includes(lower)) return "agent";
    if (tools.includes(lower)) return "tool";
    return classify(query);
}

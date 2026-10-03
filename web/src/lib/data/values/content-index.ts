import { classify, extractValues, hostOf, mainDomain, normalize, TRACED_KINDS } from "./kinds";
import type { Label, ValueAppearance, ValueKind, ValueLabel, ValueMatch } from "../types";

// One value in a run's content index: where it appeared and with which label.
export type IndexedValue = {
    raw: string;
    norm: string;
    kind: ValueKind;
    host: string | null;
    domain: string | null;
    label: Label;
    stepId: string;
    agent: string;
    at: number;
};

export function indexed(
    raw: string,
    kind: ValueKind | undefined,
    label: Label,
    stepId: string,
    agent: string,
    at: number,
): IndexedValue {
    const k = kind ?? classify(raw);
    const host = hostOf(raw, k);
    return {
        raw,
        norm: normalize(raw, k),
        kind: k,
        host,
        domain: host ? mainDomain(host) : null,
        label,
        stepId,
        agent,
        at,
    };
}

const STRENGTH: Record<ValueMatch, number> = { exact: 4, inside: 3, host: 2, domain: 1 };

function matchOf(entry: IndexedValue, norm: string, host: string | null, domain: string | null): ValueMatch | null {
    if (entry.norm === norm) return "exact";
    if (host && entry.host === host) return "host";
    if (domain && entry.domain === domain) return "domain";
    return null;
}

// Every place a value appeared earlier in the run, across all agents, first appearance first.
// Amounts and plain words are not traced on their own, only values found inside them.
export function traceValue(index: IndexedValue[], raw: string, kind?: ValueKind): ValueLabel {
    const k = kind ?? classify(raw);
    if (k === "amount") return { kind: k, traced: false, generated: false, appearances: [] };

    const candidates: { raw: string; kind: ValueKind; inside: boolean }[] = [];
    if (TRACED_KINDS.has(k)) candidates.push({ raw, kind: k, inside: false });
    for (const inner of extractValues(raw)) {
        if (inner.raw !== raw) candidates.push({ ...inner, inside: true });
    }

    const best = new Map<string, ValueAppearance>();
    for (const candidate of candidates) {
        const norm = normalize(candidate.raw, candidate.kind);
        const host = hostOf(candidate.raw, candidate.kind);
        const domain = host ? mainDomain(host) : null;
        for (const entry of index) {
            const found = matchOf(entry, norm, host, domain);
            if (!found) continue;
            const match: ValueMatch = candidate.inside && found === "exact" ? "inside" : found;
            const current = best.get(entry.stepId);
            if (current && STRENGTH[current.match] >= STRENGTH[match]) continue;
            best.set(entry.stepId, {
                label: entry.label,
                stepId: entry.stepId,
                agent: entry.agent,
                at: entry.at,
                match,
            });
        }
    }

    const appearances = [...best.values()].sort((a, b) => a.at - b.at || STRENGTH[b.match] - STRENGTH[a.match]);
    if (!TRACED_KINDS.has(k)) {
        return { kind: k, traced: appearances.length > 0, generated: false, appearances };
    }
    return { kind: k, traced: true, generated: appearances.length === 0, appearances };
}

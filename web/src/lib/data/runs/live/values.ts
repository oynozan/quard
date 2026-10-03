import type { RunLabel } from "@quard/db";
import type { ValueAppearance, ValueKind, ValueLabel, ValueMatch } from "../../types";
import type { StepArg } from "../types";

// A stored value key, such as "iban:<masked>#<hash>" for a sensitive value or "host:<name>" for others
type Key = { kind: string; shown: string; full: string };

const SENSITIVE = new Set(["iban", "email"]);
// Strongest first: an exact value beats its host, which beats its main domain
const ORDER = ["iban", "email", "url", "path", "id", "host", "domain"];
const KIND: Record<string, ValueKind> = {
    iban: "iban",
    email: "email",
    url: "url",
    path: "path",
    id: "id",
    host: "domain",
    domain: "domain",
};

export function parseKey(full: string): Key {
    const at = full.indexOf(":");
    const kind = full.slice(0, at);
    const rest = full.slice(at + 1);
    const hash = rest.lastIndexOf("#");
    return { kind, shown: SENSITIVE.has(kind) && hash !== -1 ? rest.slice(0, hash) : rest, full };
}

// Leaf values of the redacted arguments by path, such as "iban" or "lines[0].amount"
export function flatten(value: unknown, path = ""): { path: string; value: string }[] {
    if (Array.isArray(value)) return value.flatMap((item, i) => flatten(item, `${path}[${i}]`));
    if (value !== null && typeof value === "object") {
        return Object.entries(value).flatMap(([name, item]) => flatten(item, path ? `${path}.${name}` : name));
    }
    return value === undefined ? [] : [{ path: path || "input", value: String(value) }];
}

function rank(key: Key): number {
    const index = ORDER.indexOf(key.kind);
    return index === -1 ? ORDER.length : index;
}

function matchOf(key: Key, value: string): ValueMatch {
    if (key.kind === "host") return "host";
    if (key.kind === "domain") return "domain";
    return key.shown === value ? "exact" : "inside";
}

// Where a value appeared before the call, traced through the value keys stored with each label
export function valueLabelOf(value: string, keys: Key[], before: RunLabel[], generated: boolean): ValueLabel {
    const own = keys.filter((key) => key.shown !== "" && value.includes(key.shown)).sort((a, b) => rank(a) - rank(b));
    const appearances: ValueAppearance[] = [];
    for (const label of before) {
        const key = own.find((candidate) => label.keys.includes(candidate.full));
        if (key) {
            appearances.push({
                label: { origin: label.origin, trust: label.trust, sensitivity: label.sensitivity },
                stepId: label.stepId,
                agent: label.agent,
                at: label.at.getTime(),
                match: matchOf(key, value),
            });
        }
    }
    const strongest = own[0];
    if (!strongest) {
        const amount = /^-?\d+(\.\d+)?$/.test(value.trim());
        return { kind: amount ? "amount" : "text", traced: false, generated: false, appearances: [] };
    }
    return {
        kind: KIND[strongest.kind] ?? "id",
        traced: true,
        generated: generated || appearances.length === 0,
        appearances,
    };
}

// The call's arguments as the step drawer lists them. Values stay masked.
export function argsOf(args: unknown, keys: string[], before: RunLabel[], generatedFields: Set<string>): StepArg[] {
    const parsed = keys.map(parseKey);
    return flatten(args).map(({ path, value }) => {
        const valueLabel = valueLabelOf(value, parsed, before, generatedFields.has(path));
        return { name: path, value, masked: value.includes("…"), valueLabel };
    });
}

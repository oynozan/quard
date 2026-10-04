import {
    createRedactor,
    extractValues,
    flattenArgs,
    fleetValue,
    valueAtPath,
    type FleetValue,
    type QuarantineEntry,
    type Redactor,
} from "@quard/shared";
import { projectRedactor } from "../../core/project-key.ts";
import type { FailResult, GuardCall, Mode, RuleResult } from "../call.ts";
import type { LimitOptions } from "../options.ts";

const KINDS = new Set(["iban", "email", "domain"]);
// Only these go to control as hashes; domains and wallets stay in clear
const HASHED = new Set(["iban", "email"]);
// The most values control takes in one fleet report
const MAX_VALUES = 100;
// A hash keeps a key's shape, so keys are checked with
// this stand-in while the project's key is unknown
const STANDIN = createRedactor(Buffer.alloc(32));

// The quarantine list as last synced from control
export type FleetView = {
    // The entry for a key, while the synced copy is fresh enough to use
    entry(key: string, now: number): QuarantineEntry | undefined;
    // False while the fleet check is in its first, observe-only days
    pastObserve(now: number): boolean;
};

function hashedKey(kind: string, key: string, redactor: Redactor): string {
    return HASHED.has(kind) ? redactor.key(key) : key;
}

// The IBANs, emails and main domains in the watched fields. Their keys
// stay plain in this process until hashedValues() hashes them for control.
export function fleetValues(input: unknown, fields: readonly string[]): FleetValue[] {
    const found = new Map<string, FleetValue>();
    for (const field of fields) {
        for (const { value } of flattenArgs(valueAtPath(input, field))) {
            for (const key of extractValues(value).flatMap((item) => item.keys)) {
                const kind = key.slice(0, key.indexOf(":"));
                const parsed = KINDS.has(kind)
                    ? fleetValue.safeParse({ field, kind, key: hashedKey(kind, key, STANDIN) })
                    : undefined;
                if (parsed?.success === true && !found.has(key)) {
                    found.set(key, { ...parsed.data, key });
                }
            }
        }
    }
    return [...found.values()];
}

// The values as control takes them, hashed with the project's key
export function hashedValues(values: readonly FleetValue[], redactor: Redactor): FleetValue[] {
    return values.map((value) => ({ ...value, key: hashedKey(value.kind, value.key, redactor) }));
}

// The values split into reports control takes
export function fleetChunks(values: readonly FleetValue[]): FleetValue[][] {
    const chunks: FleetValue[][] = [];
    for (let at = 0; at < values.length; at += MAX_VALUES) {
        chunks.push(values.slice(at, at + MAX_VALUES));
    }
    return chunks;
}

// Anything short of an enforced quarantine records "would block"
export function fleetResult(field: string, enforced: boolean): FailResult {
    return {
        guard: "limit",
        rule: "fleet-check",
        decision: "block",
        mode: enforced ? "block" : "observe",
        reason: "value_quarantined",
        field,
    };
}

export function isEnforced(mode: Mode, entry: QuarantineEntry, pastObserve: boolean): boolean {
    return mode === "block" && !entry.observe && pastObserve;
}

// Any enforced match wins, else the first "would block"
export function fleetMatch(
    values: readonly FleetValue[],
    mode: Mode,
    pastObserve: boolean,
    entryOf: (key: string) => QuarantineEntry | undefined,
): FailResult | undefined {
    let first: FailResult | undefined;
    for (const value of values) {
        const entry = entryOf(value.key);
        if (entry !== undefined) {
            const result = fleetResult(value.field, isEnforced(mode, entry, pastObserve));
            if (result.mode === "block") {
                return result;
            }
            first ??= result;
        }
    }
    return first;
}

// Checks watched values against the synced quarantine list
export function checkFleet(
    call: GuardCall,
    options: LimitOptions,
    mode: Mode,
    fleet: FleetView | undefined,
): RuleResult[] {
    if (options.fleetCheck === undefined || fleet === undefined) {
        return [];
    }
    const now = Date.now();
    // Control's ready message brings the key before the list,
    // so without the key there is no list yet
    const redactor = projectRedactor();
    const values = redactor === undefined ? [] : hashedValues(fleetValues(call.input, options.fleetCheck), redactor);
    const found = fleetMatch(values, mode, fleet.pastObserve(now), (key) => fleet.entry(key, now));
    return [found ?? { guard: "limit", rule: "fleet-check", decision: "allow", mode }];
}

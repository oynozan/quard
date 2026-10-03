import {
    extractValues,
    flattenArgs,
    fleetValue,
    valueAtPath,
    type FleetValue,
    type QuarantineEntry,
    type Redactor,
} from "@quard/shared";
import type { FailResult, GuardCall, Mode, RuleResult } from "../call.ts";
import type { LimitOptions } from "../options.ts";

const KINDS = new Set(["iban", "email", "domain"]);
// The most values control takes in one fleet report
const MAX_VALUES = 100;

// The quarantine list as last synced from control
export type FleetView = {
    redactor: Redactor;
    // The entry for a key, while the synced copy is fresh enough to use
    entry(key: string, now: number): QuarantineEntry | undefined;
    // False while the fleet check is in its first, observe-only days
    pastObserve(now: number): boolean;
};

// Domains stay in clear, so only IBANs and emails are hashed and masked
function fleetKey(kind: string, key: string, redactor: Redactor): string {
    return kind === "domain" ? key : redactor.key(key);
}

// The IBANs, emails and main domains in the watched fields, as hashed keys
export function fleetValues(input: unknown, fields: readonly string[], redactor: Redactor): FleetValue[] {
    const found = new Map<string, FleetValue>();
    for (const field of fields) {
        for (const { value } of flattenArgs(valueAtPath(input, field))) {
            for (const key of extractValues(value).flatMap((item) => item.keys)) {
                const kind = key.slice(0, key.indexOf(":"));
                const parsed = KINDS.has(kind)
                    ? fleetValue.safeParse({ field, kind, key: fleetKey(kind, key, redactor) })
                    : undefined;
                if (parsed?.success === true && !found.has(parsed.data.key)) {
                    found.set(parsed.data.key, parsed.data);
                }
            }
        }
    }
    return [...found.values()];
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
    const values = fleetValues(call.input, options.fleetCheck, fleet.redactor);
    const found = fleetMatch(values, mode, fleet.pastObserve(now), (key) => fleet.entry(key, now));
    return [found ?? { guard: "limit", rule: "fleet-check", decision: "allow", mode }];
}

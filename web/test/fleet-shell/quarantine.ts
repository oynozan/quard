import type { FleetCheckFacts, QuarantineData, QuarantinedValue, WatchedValue } from "@/lib/data/fleet";
import { DAY, HOUR, MINUTE, NOW, SECOND } from "../time";

const hash = (char: string) => char.repeat(32);

// Quarantined values as the Summary page reads them: an IBAN, a domain held in observe mode, and an email
export function quarantined(): QuarantinedValue[] {
    return [
        {
            kind: "iban",
            field: "iban",
            key: `iban:LT12…1000#${hash("a")}`,
            value: "LT12…1000",
            hash: hash("a"),
            firstSeenAt: NOW - 4 * DAY - 4 * HOUR - 12 * MINUTE,
            quarantinedAt: NOW - 4 * DAY - 3 * HOUR - 4 * MINUTE,
            observe: false,
            runs: 5,
            blockedAttempts: 9,
            agents: ["billing"],
            lastAttemptAt: NOW - 2 * HOUR - 41 * MINUTE,
        },
        {
            kind: "domain",
            field: "url",
            key: "domain:acme-billing.net",
            value: "acme-billing.net",
            hash: null,
            firstSeenAt: NOW - 4 * DAY - 5 * HOUR,
            quarantinedAt: NOW - 4 * DAY - 2 * HOUR - 50 * MINUTE,
            observe: true,
            runs: 5,
            blockedAttempts: 0,
            agents: ["researcher"],
            lastAttemptAt: NOW - 3 * DAY - 9 * HOUR,
        },
        {
            kind: "email",
            field: "to",
            key: `email:p…@claims-desk.io#${hash("b")}`,
            value: "p…@claims-desk.io",
            hash: hash("b"),
            firstSeenAt: NOW - 13 * DAY - 7 * HOUR,
            quarantinedAt: NOW - 13 * DAY - HOUR,
            observe: false,
            runs: 5,
            blockedAttempts: 2,
            agents: ["billing", "support"],
            lastAttemptAt: NOW - 12 * DAY,
        },
    ];
}

function watch(n: number, kind: WatchedValue["kind"], value: string, runs: number, age: number): WatchedValue {
    const field = kind === "email" ? "to" : kind;
    return {
        kind,
        field,
        key: `${kind}:${value}#${hash(String(n))}`,
        value,
        hash: hash(String(n)),
        firstSeenAt: NOW - age,
        runs,
        agents: [kind === "email" ? "support" : "billing"],
    };
}

// New values the check is counting: one at 3 runs, one at 2, three at 1
export function watched(): WatchedValue[] {
    return [
        watch(1, "iban", "GB29…6819", 1, 4 * MINUTE + 10 * SECOND),
        watch(2, "email", "r…@claims-desk.io", 2, 17 * MINUTE),
        watch(3, "email", "c…@claims-desk.io", 1, 3 * MINUTE + 26 * SECOND),
        watch(4, "email", "a…@claims-desk.io", 1, 9 * HOUR),
        watch(5, "iban", "FR14…0606", 3, 2 * DAY + 6 * HOUR),
    ];
}

export const CHECK: FleetCheckFacts = {
    fields: ["iban", "to", "url"],
    newForDays: 7,
    runsToBlock: 5,
    withinHours: 24,
    observeUntil: null,
};

// The whole quarantine section, read at NOW
export function quarantineData(changes: Partial<QuarantineData> = {}): QuarantineData {
    return { now: NOW, quarantine: quarantined(), watching: watched(), check: CHECK, ...changes };
}

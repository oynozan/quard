import { maskValue } from "../../mask";
import { NOW, MINUTE, HOUR, DAY } from "../rng";
import { keyedHash } from "../values/hash";
import { normalize } from "../values/kinds";
import { PLANTED } from "../values/pool";
import type { QuarantinedValue, WatchedValue } from "./types";

type Kind = QuarantinedValue["kind"];

function shown(kind: Kind, raw: string): { value: string; hash: string } {
    return { value: kind === "domain" ? raw : maskValue(raw), hash: keyedHash(normalize(raw, kind)) };
}

// Blocked everywhere after a 5th run in 24 hours, until someone marks them known.
export function quarantined(): QuarantinedValue[] {
    const rows: (Omit<QuarantinedValue, "value" | "hash"> & { raw: string })[] = [
        {
            kind: "iban",
            field: "iban",
            raw: PLANTED.quarantinedIban,
            firstSeenAt: NOW - 4 * DAY - 4 * HOUR - 12 * MINUTE,
            quarantinedAt: NOW - 4 * DAY - 3 * HOUR - 4 * MINUTE,
            runs: 5,
            blockedAttempts: 9,
            agents: ["billing"],
            lastAttemptAt: NOW - 2 * HOUR - 41 * MINUTE,
        },
        {
            kind: "domain",
            field: "url",
            raw: PLANTED.lookalikeDomain,
            firstSeenAt: NOW - 4 * DAY - 5 * HOUR,
            quarantinedAt: NOW - 4 * DAY - 2 * HOUR - 50 * MINUTE,
            runs: 5,
            blockedAttempts: 3,
            agents: ["researcher"],
            lastAttemptAt: NOW - 3 * DAY - 9 * HOUR,
        },
        {
            kind: "email",
            field: "to",
            raw: PLANTED.payeeEmail,
            firstSeenAt: NOW - 13 * DAY - 7 * HOUR,
            quarantinedAt: NOW - 13 * DAY - 1 * HOUR,
            runs: 5,
            blockedAttempts: 2,
            agents: ["billing", "support"],
            lastAttemptAt: NOW - 12 * DAY,
        },
    ];
    return rows.map(({ raw, ...row }) => ({ ...row, ...shown(row.kind, raw) }));
}

// New values the fleet check is still counting.
export function watched(): WatchedValue[] {
    const rows: (Omit<WatchedValue, "value" | "hash"> & { raw: string })[] = [
        {
            kind: "iban",
            field: "iban",
            raw: PLANTED.storyIban,
            firstSeenAt: NOW - 4 * MINUTE - 10_000,
            runs: 1,
            agents: ["billing"],
        },
        {
            kind: "email",
            field: "to",
            raw: "refunds@claims-desk.io",
            firstSeenAt: NOW - 17 * MINUTE,
            runs: 2,
            agents: ["support"],
        },
        {
            kind: "email",
            field: "to",
            raw: "claims-team@claims-desk.io",
            firstSeenAt: NOW - 3 * MINUTE - 26_000,
            runs: 1,
            agents: ["support"],
        },
        {
            kind: "email",
            field: "to",
            raw: "audit@claims-desk.io",
            firstSeenAt: NOW - 9 * HOUR,
            runs: 1,
            agents: ["support"],
        },
        {
            kind: "iban",
            field: "iban",
            raw: PLANTED.watchedIban,
            firstSeenAt: NOW - 2 * DAY - 6 * HOUR,
            runs: 3,
            agents: ["billing"],
        },
    ];
    return rows.map(({ raw, ...row }) => ({ ...row, ...shown(row.kind, raw) }));
}

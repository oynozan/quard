import { maskSecret } from "../../mask";
import { NOW, MINUTE, HOUR, DAY } from "../rng";
import type { AgentKey, RetentionRow } from "./types";

type KeySpec = Omit<AgentKey, "prefix"> & { secret: string };

// Full keys exist only here, to derive the prefix the dashboard shows.
const KEYS: KeySpec[] = [
    {
        id: "key_7f31",
        name: "billing-service",
        secret: "qk_live_7f31a9c04e2b5d8f1a6c3e90b7d24f18",
        scope: "app",
        agents: ["billing"],
        createdAt: NOW - 61 * DAY,
        createdBy: "dana@acme.com",
        lastUsedAt: NOW - 12_000,
        revokedAt: null,
        revokedBy: null,
    },
    {
        id: "key_2c8e",
        name: "orchestrator-app",
        secret: "qk_live_2c8e05b9d3f17a6e4c0b8d2f9a1e7c35",
        scope: "app",
        agents: ["orchestrator", "researcher"],
        createdAt: NOW - 58 * DAY,
        createdBy: "dana@acme.com",
        lastUsedAt: NOW - 4_000,
        revokedAt: null,
        revokedBy: null,
    },
    {
        id: "key_a40d",
        name: "support-app",
        secret: "qk_live_a40d6e2f8b1c5a9d3e7f0b4c8a2d6e19",
        scope: "app",
        agents: ["support", "inbox-triage"],
        createdAt: NOW - 47 * DAY,
        createdBy: "li.wei@acme.com",
        lastUsedAt: NOW - 31_000,
        revokedAt: null,
        revokedBy: null,
    },
    {
        id: "key_91be",
        name: "deploy-bot",
        secret: "qk_live_91be3c7a0f5d2e8b6a4c1f9d7e3b0a52",
        scope: "agent",
        agents: ["deploy-bot"],
        createdAt: NOW - 24 * DAY,
        createdBy: "li.wei@acme.com",
        lastUsedAt: NOW - 47 * MINUTE,
        revokedAt: null,
        revokedBy: null,
    },
    {
        id: "key_5f02",
        name: "staging",
        secret: "qk_test_5f02d8b4e1a7c3f9b6d0e2a8c5f1b7d3",
        scope: "app",
        agents: ["orchestrator", "researcher", "billing"],
        createdAt: NOW - 40 * DAY,
        createdBy: "dana@acme.com",
        lastUsedAt: NOW - 3 * DAY - 2 * HOUR,
        revokedAt: null,
        revokedBy: null,
    },
    {
        id: "key_0e77",
        name: "billing-service (old)",
        secret: "qk_live_0e77c1a9f4b2d6e8a3c5f7b9d1e0a2c4",
        scope: "app",
        agents: ["billing"],
        createdAt: NOW - 96 * DAY,
        createdBy: "dana@acme.com",
        lastUsedAt: NOW - 61 * DAY,
        revokedAt: NOW - 61 * DAY,
        revokedBy: "dana@acme.com",
    },
];

export function agentKeys(): AgentKey[] {
    return KEYS.map(({ secret, ...key }) => ({ ...key, prefix: maskSecret(secret) }));
}

export function keyPrefix(id: string): string {
    const key = KEYS.find((item) => item.id === id);
    return key ? maskSecret(key.secret) : "—";
}

// PROJECT.md "Retention". Each project can change the run window.
export const RETENTION: RetentionRow[] = [
    { item: "Runs", keep: "30 days", days: 30, note: "Steps, messages, labels and guard decisions go with the run" },
    { item: "Runs tied to an incident", keep: "1 year", days: 365, note: "So verdicts and replay keep working" },
    { item: "Memory labels", keep: "Kept", days: null, note: "Not deleted with runs; they come back on read" },
    { item: "Fleet first-seen index", keep: "1 year", days: 365, note: "Hashed, so old values don't look new again" },
    {
        item: "Approval arguments",
        keep: "Until decided",
        days: null,
        note: "Open requests keep full values; after the decision only the hash and masks stay",
    },
];

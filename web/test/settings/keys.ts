import type { AgentKey } from "@/lib/data/settings";
import { DAY, NOW } from "../time";

// A key as the page reads it, with an id made from its name
export function agentKey(name: string, fields: Partial<AgentKey> = {}): AgentKey {
    return {
        id: `key-${name}`,
        name,
        prefix: "qk_live_7f31",
        createdAt: NOW - 10 * DAY,
        lastUsedAt: null,
        revokedAt: null,
        ...fields,
    };
}

// Three active keys and one revoked key, oldest first
export const KEYS: AgentKey[] = [
    agentKey("billing-service (old)", {
        prefix: "qk_live_0e77",
        createdAt: NOW - 96 * DAY,
        lastUsedAt: NOW - 61 * DAY,
        revokedAt: NOW - 61 * DAY,
    }),
    agentKey("billing-service", { prefix: "qk_live_7f31", createdAt: NOW - 61 * DAY, lastUsedAt: NOW - 12_000 }),
    agentKey("orchestrator-app", { prefix: "qk_live_2c8e", createdAt: NOW - 58 * DAY, lastUsedAt: NOW - 4_000 }),
    agentKey("deploy-bot", { prefix: "qk_live_91be", createdAt: NOW - 24 * DAY }),
];

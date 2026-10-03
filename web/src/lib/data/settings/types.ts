import type { OriginOverride } from "../labels/origins";
import type { GuardMode, GuardType } from "../types";

// A key the SDK sends events with, shown only by its prefix
export type AgentKey = {
    id: string;
    name: string;
    // The first 12 characters, such as "qk_live_7f31"
    prefix: string;
    createdAt: number;
    // The last upload made with the key
    lastUsedAt: number | null;
    revokedAt: number | null;
};

export type RetentionRow = {
    item: string;
    // Such as "30 days", "1 year" or "Kept"
    keep: string;
    days: number | null;
};

// A rule from code, read-only here because rules change through pull requests
export type RuleRow = {
    name: string;
    guard: GuardType;
    tools: string[];
    apps: string[];
    // Null for approval guards, which always ask
    mode: GuardMode | null;
    hash: string;
    summary: string;
    source: "team" | "product default";
};

// An app that runs the SDK, as it reports itself when it connects
export type SdkConnection = {
    name: string;
    agents: string[];
    sdkVersion: string;
    runtime: string;
    // The prefix of the agent key it uses
    key: string;
    rulesHash: string;
    // The hash before the last deploy, and when it changed
    previousHash: string | null;
    hashSince: number;
    lastSeenAt: number;
    state: "connected" | "offline";
};

export type SettingsData = {
    // False on a new install, before anyone made a key
    hasProject: boolean;
    keys: AgentKey[];
    retention: RetentionRow[];
    origins: OriginOverride[];
    rules: RuleRow[];
    sdks: SdkConnection[];
};

// A new key, whose full secret travels to the drawer once and is never stored
export type CreatedKey = { key: Pick<AgentKey, "id" | "name" | "prefix">; secret: string };

export type CreateKeyResult = CreatedKey | { error: string };

export type RevokeKeyResult = { ok: true } | { error: string };

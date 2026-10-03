import type { SdkApp } from "../guards/apps";
import type { OriginOverride } from "../labels/origins";
import type { Account } from "../values/people";
import type { GuardMode, GuardType } from "../types";

// The SDK talks to webhook and control with agent keys only. The dashboard shows a prefix.
export type AgentKey = {
    id: string;
    name: string;
    // "qk_live_7f31…"
    prefix: string;
    scope: "agent" | "app";
    agents: string[];
    createdAt: number;
    createdBy: string;
    lastUsedAt: number | null;
    revokedAt: number | null;
    revokedBy: string | null;
};

export type RetentionRow = {
    item: string;
    // "30 days", "1 year", "Kept".
    keep: string;
    days: number | null;
    note: string;
};

// A rule from code. Read-only here: rules change through pull requests.
export type RuleRow = {
    name: string;
    guard: GuardType;
    tools: string[];
    apps: string[];
    // Null for approval guards, which always ask.
    mode: GuardMode | null;
    hash: string;
    summary: string;
    source: "team" | "product default";
};

export type SdkConnection = Omit<SdkApp, "keyId"> & { key: string };

export type SettingsData = {
    project: { id: string; name: string };
    keys: AgentKey[];
    accounts: Account[];
    retention: RetentionRow[];
    origins: OriginOverride[];
    rules: RuleRow[];
    sdks: SdkConnection[];
    hashKey: { algorithm: string; setAt: number; previousKeptUntil: number | null };
    detector: { name: string; version: string; mode: GuardMode };
};

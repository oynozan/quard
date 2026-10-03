import "server-only";
import {
    connectedApps,
    listAgentKeys,
    originOverrides,
    projectSettings,
    ruleSets,
    type AgentKeyRow,
    type ConnectedAppRow,
    type OriginOverrideRow,
} from "@quard/db";
import { DAY } from "@/lib/time";
import { DEFAULT_MAPPING, originKind, type OriginOverride } from "../labels/origins";
import { projectScope } from "../scope";
import { retentionRows } from "./retention";
import { rulesOf } from "./rules";
import type { AgentKey, SdkConnection, SettingsData } from "./types";

// Overrides come from the newest runs, the same window the runs list reads
const RUNS = 200;

// An app offline for longer than this drops off the list, with its rules
const APP_DAYS = 30;

function empty(): SettingsData {
    return { hasProject: false, keys: [], retention: [], origins: [], rules: [], sdks: [] };
}

function msOf(time: Date | null): number | null {
    return time === null ? null : time.getTime();
}

function keyOf(row: AgentKeyRow): AgentKey {
    return {
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        createdAt: row.createdAt.getTime(),
        lastUsedAt: msOf(row.lastUsedAt),
        revokedAt: msOf(row.revokedAt),
    };
}

// An override beside the default it replaces, which also fills a side it left out
function overrideOf(row: OriginOverrideRow): OriginOverride {
    const base = DEFAULT_MAPPING[originKind(row.origin)];
    return {
        origin: row.origin,
        trust: row.trust ?? base.trust,
        sensitivity: row.sensitivity ?? base.sensitivity,
        defaultTrust: base.trust,
        defaultSensitivity: base.sensitivity,
        agents: row.agents,
        seenAt: row.seenAt.getTime(),
    };
}

// Control hears from a connected app right now
function appOf(row: ConnectedAppRow, now: number): SdkConnection {
    return {
        id: row.keyId,
        name: row.name,
        host: row.host,
        sdkVersion: row.sdk,
        key: row.prefix,
        rulesHash: row.rulesHash,
        lastSeenAt: row.disconnectedAt?.getTime() ?? now,
        state: row.disconnectedAt === null ? "connected" : "offline",
    };
}

// The current project's keys, retention, the origin overrides its runs reported, and its apps and their rules
export async function getSettings(): Promise<SettingsData> {
    const scope = await projectScope();
    if (!scope) return empty();
    const { db, project } = scope;
    const now = Date.now();
    const [keys, settings, origins, apps] = await Promise.all([
        listAgentKeys(db, project.id),
        projectSettings(db, project.id),
        originOverrides(db, project.id, { limit: RUNS }),
        connectedApps(db, project.id, { since: new Date(now - APP_DAYS * DAY) }),
    ]);
    // The project was removed between the two reads
    if (!settings) return empty();
    const sets = await ruleSets(db, project.id, [...new Set(apps.flatMap((app) => app.rulesHashes))]);
    return {
        hasProject: true,
        keys: keys.map(keyOf),
        retention: retentionRows(settings.retentionDays),
        origins: origins.map(overrideOf),
        rules: rulesOf(sets, apps),
        sdks: apps.map((app) => appOf(app, now)),
    };
}

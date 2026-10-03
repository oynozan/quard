import "server-only";
import { listAgentKeys, originOverrides, projectSettings, type AgentKeyRow, type OriginOverrideRow } from "@quard/db";
import { DEFAULT_MAPPING, originKind, type OriginOverride } from "../labels/origins";
import { projectScope } from "../scope";
import { retentionRows } from "./retention";
import type { AgentKey, SettingsData } from "./types";

// Overrides come from the newest runs, the same window the runs list reads
const RUNS = 200;

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

// The current project's keys, retention and the origin overrides its runs reported
export async function getSettings(): Promise<SettingsData> {
    const scope = await projectScope();
    if (!scope) return empty();
    const { db, project } = scope;
    const [keys, settings, origins] = await Promise.all([
        listAgentKeys(db, project.id),
        projectSettings(db, project.id),
        originOverrides(db, project.id, { limit: RUNS }),
    ]);
    // The project was removed between the two reads
    if (!settings) return empty();
    return {
        hasProject: true,
        keys: keys.map(keyOf),
        retention: retentionRows(settings.retentionDays),
        origins: origins.map(overrideOf),
        // Rules and connected apps arrive with the SDK connect step
        rules: [],
        sdks: [],
    };
}

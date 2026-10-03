import {
    fleetFields,
    fleetObserveUntil,
    listQuarantined,
    listWatched,
    type QuarantinedFleetItem,
    type WatchedFleetItem,
} from "@quard/db";
import { FLEET_CHECK } from "@quard/shared";
import { projectScope } from "../scope";
import type { FleetCheckFacts, QuarantineData, QuarantinedValue, WatchedValue } from "./types";

const ms = (date: Date) => date.getTime();

export function quarantinedOf(item: QuarantinedFleetItem): QuarantinedValue {
    return {
        kind: item.kind,
        field: item.field,
        key: item.key,
        value: item.value,
        hash: item.hash,
        firstSeenAt: ms(item.firstSeenAt),
        quarantinedAt: ms(item.quarantinedAt),
        observe: item.observe,
        runs: item.runs,
        blockedAttempts: item.blockedAttempts,
        agents: item.agents,
        lastAttemptAt: item.lastAttemptAt ? ms(item.lastAttemptAt) : null,
    };
}

export function watchedOf(item: WatchedFleetItem): WatchedValue {
    return {
        kind: item.kind,
        field: item.field,
        key: item.key,
        value: item.value,
        hash: item.hash,
        firstSeenAt: ms(item.firstSeenAt),
        runs: item.runs,
        agents: item.agents,
    };
}

// The fleet check's quarantine, the new values it counts and how it decides
export async function getQuarantine(): Promise<QuarantineData> {
    const scope = await projectScope();
    const now = Date.now();
    const { newForDays, runsToBlock, withinHours } = FLEET_CHECK;
    const check: FleetCheckFacts = { fields: [], newForDays, runsToBlock, withinHours, observeUntil: null };
    if (!scope) return { now, quarantine: [], watching: [], check };
    const { db, project } = scope;
    const [quarantined, watched, fields, observeUntil] = await Promise.all([
        listQuarantined(db, project.id),
        listWatched(db, project.id, new Date(now)),
        fleetFields(db, project.id),
        fleetObserveUntil(db, project.id),
    ]);
    return {
        now,
        quarantine: quarantined.map(quarantinedOf),
        watching: watched.map(watchedOf),
        check: { ...check, fields, observeUntil: observeUntil ? ms(observeUntil) : null },
    };
}

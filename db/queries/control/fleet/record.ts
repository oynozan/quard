import { FLEET_CHECK, type FleetValue, type QuarantineEntry } from "@quard/shared";
import { sql, type Transaction } from "kysely";
import type { Db } from "../../../connect/connect.ts";
import { CHANNELS, notify } from "../../../notify/channels.ts";
import type { Database } from "../../../schema/database.ts";
import { daysBefore, hoursBefore, observeEnd } from "./window.ts";

export type FleetUseInput = { runId: string; agent: string; tool: string; blocked: boolean; values: FleetValue[] };

export type FleetUseResult = {
    // This call's values that are quarantined now
    quarantined: QuarantineEntry[];
    // Values this call quarantined, or moved from observe to enforce
    added: QuarantineEntry[];
    observeUntil: Date;
};

type Trx = Transaction<Database>;

type ValueRow = {
    key: string;
    first_seen_at: Date;
    quarantined_at: Date | null;
    observe: boolean;
    known_at: Date | null;
    runs: number;
};

// Starts the check's clock on first use. The row lock also makes uses in one
// project take turns, so two runs at the same time are both counted.
async function fleetStart(trx: Trx, projectId: string, now: Date): Promise<Date> {
    const project = await trx
        .selectFrom("projects")
        .select("fleet_started_at")
        .where("id", "=", projectId)
        .forNoKeyUpdate()
        .executeTakeFirstOrThrow();
    if (project.fleet_started_at !== null) {
        return project.fleet_started_at;
    }
    await trx.updateTable("projects").set({ fleet_started_at: now }).where("id", "=", projectId).execute();
    return now;
}

// Whether this use quarantines the value. A new value used by enough separate
// runs is quarantined; a known one never is. After the observe days, an
// observe entry that is still busy is enforced.
function dueForQuarantine(row: ValueRow, observing: boolean, newSince: Date): boolean {
    const hot = row.known_at === null && row.first_seen_at > newSince && row.runs >= FLEET_CHECK.runsToBlock;
    if (!hot) {
        return false;
    }
    return row.quarantined_at === null || (!observing && row.observe);
}

// Each value with its separate runs in the window that counts
async function valueRows(trx: Trx, projectId: string, keys: string[], since: Date): Promise<ValueRow[]> {
    return trx
        .selectFrom("fleet_values as v")
        .select([
            "v.key",
            "v.first_seen_at",
            "v.quarantined_at",
            "v.observe",
            "v.known_at",
            sql<number>`(SELECT count(DISTINCT u.run_id)::int FROM fleet_uses u WHERE u.project_id = v.project_id AND u.key = v.key AND u.at > ${since})`.as(
                "runs",
            ),
        ])
        .where("v.project_id", "=", projectId)
        .where("v.key", "in", keys)
        .orderBy("v.key")
        .execute();
}

// Quarantines the values and tells control. Checks known_at again, so a value
// someone marks as known meanwhile stays out. Returns the keys it changed.
async function quarantine(
    trx: Trx,
    projectId: string,
    keys: string[],
    observing: boolean,
    now: Date,
): Promise<string[]> {
    const rows = await trx
        .updateTable("fleet_values")
        .set({ quarantined_at: now, observe: observing })
        .where("project_id", "=", projectId)
        .where("key", "in", keys)
        .where("known_at", "is", null)
        .returning("key")
        .execute();
    await notify(trx, CHANNELS.fleet, projectId);
    return rows.map((row) => row.key);
}

// Records a call that used watched values, blocked attempts included, and
// quarantines values that reach the limit. One transaction per call; when
// the list changes, control hears it on the fleet channel.
export async function recordFleetUse(
    db: Db,
    projectId: string,
    use: FleetUseInput,
    now = new Date(),
): Promise<FleetUseResult> {
    // A value twice in one call counts once, with the first field it was in
    const values = use.values.filter((value, at) => use.values.findIndex((other) => other.key === value.key) === at);
    const keys = values.map((value) => value.key);
    return db.transaction().execute(async (trx) => {
        const observeUntil = observeEnd(await fleetStart(trx, projectId, now));
        if (keys.length === 0) {
            return { quarantined: [], added: [], observeUntil };
        }
        await trx
            .insertInto("fleet_values")
            .values(
                values.map((value) => ({
                    project_id: projectId,
                    key: value.key,
                    kind: value.kind,
                    field: value.field,
                    first_seen_at: now,
                })),
            )
            .onConflict((conflict) => conflict.columns(["project_id", "key"]).doNothing())
            .execute();
        await trx
            .insertInto("fleet_uses")
            .values(
                keys.map((key) => ({
                    project_id: projectId,
                    key,
                    run_id: use.runId,
                    agent: use.agent,
                    tool: use.tool,
                    blocked: use.blocked,
                    at: now,
                })),
            )
            .execute();
        const rows = await valueRows(trx, projectId, keys, hoursBefore(now, FLEET_CHECK.withinHours));
        const observing = now < observeUntil;
        const newSince = daysBefore(now, FLEET_CHECK.newForDays);
        const due = rows.filter((row) => dueForQuarantine(row, observing, newSince)).map((row) => row.key);
        const changed = new Set(due.length > 0 ? await quarantine(trx, projectId, due, observing, now) : []);
        const added = due.filter((key) => changed.has(key)).map((key) => ({ key, observe: observing }));
        const quarantined = rows.flatMap((row): QuarantineEntry[] => {
            if (changed.has(row.key)) {
                return [{ key: row.key, observe: observing }];
            }
            return row.quarantined_at === null ? [] : [{ key: row.key, observe: row.observe }];
        });
        return { quarantined, added, observeUntil };
    });
}

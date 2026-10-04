import type { UploadItem } from "@quard/shared";
import { sql, type Transaction } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { Database } from "../../schema/database.ts";
import { openIncidents } from "../incidents/open.ts";
import { paymentRows } from "./payments.ts";
import {
    agentMessageRows,
    decisionRows,
    eventRows,
    isRunItem,
    labelRows,
    runRows,
    stepRows,
    type RunItem,
} from "./rows.ts";

type Trx = Transaction<Database>;

async function upsertRuns(trx: Trx, projectId: string, items: RunItem[]): Promise<void> {
    await trx
        .insertInto("runs")
        .values(runRows(projectId, items))
        .onConflict((conflict) =>
            conflict.columns(["project_id", "run_id"]).doUpdateSet({
                started_at: sql`LEAST(runs.started_at, excluded.started_at)`,
                last_event_at: sql`GREATEST(runs.last_event_at, excluded.last_event_at)`,
                degraded: sql`runs.degraded OR excluded.degraded`,
            }),
        )
        .execute();
    // The agent that started the run names it, and the end says how it finished
    for (const { event } of items) {
        if (event.type === "run_started" || event.type === "run_finished") {
            await trx
                .updateTable("runs")
                .set(
                    event.type === "run_started"
                        ? { agent: event.agent, origins: JSON.stringify(event.origins) }
                        : { ended_at: event.at, outcome: event.status, error: event.error ?? null },
                )
                .where("project_id", "=", projectId)
                .where("run_id", "=", event.runId)
                .execute();
        }
    }
}

// Blocked tool calls, and model calls an enforced step or cost limit
// refused. A step blocked twice counts once.
const BLOCKED = sql<number>`(SELECT count(*)::int FROM (
    SELECT s.step_id FROM steps s
    WHERE s.project_id = runs.project_id AND s.run_id = runs.run_id AND s.kind = 'tool_call' AND s.status = 'blocked'
    UNION
    SELECT d.step_id FROM decisions d
    WHERE d.project_id = runs.project_id AND d.run_id = runs.run_id AND d.guard = 'limit'
        AND d.rule IN ('max-steps', 'max-cost') AND d.enforced AND d.decision = 'block'
) b)`;

// Counts the runs list shows, worked out again from the stored rows
async function refreshRuns(trx: Trx, projectId: string, runIds: string[]): Promise<void> {
    const steps = (filter: string) =>
        sql<number>`(SELECT count(*)::int FROM steps s WHERE s.project_id = runs.project_id AND s.run_id = runs.run_id AND ${sql.raw(filter)})`;
    await trx
        .updateTable("runs")
        .set({
            model_calls: steps("s.kind = 'model_call'"),
            tool_calls: steps("s.kind = 'tool_call'"),
            blocked: BLOCKED,
            cost_usd: sql<number>`coalesce((SELECT sum((s.detail->>'costUsd')::double precision) FROM steps s WHERE s.project_id = runs.project_id AND s.run_id = runs.run_id AND s.kind = 'model_call'), 0)`,
            // A model call that answered but has no price makes the total unknown
            cost_known: sql<boolean>`NOT EXISTS (SELECT 1 FROM steps s WHERE s.project_id = runs.project_id AND s.run_id = runs.run_id AND s.kind = 'model_call' AND s.status = 'ok' AND s.detail->>'costUsd' IS NULL)`,
            influenced: sql<boolean>`EXISTS (SELECT 1 FROM steps s WHERE s.project_id = runs.project_id AND s.run_id = runs.run_id AND s.influenced)`,
            flagged: sql<boolean>`EXISTS (SELECT 1 FROM labels l WHERE l.project_id = runs.project_id AND l.run_id = runs.run_id AND cardinality(l.flags) > 0)`,
            spend_usd: sql<number>`coalesce((SELECT sum(p.usd) FROM payments p WHERE p.project_id = runs.project_id AND p.run_id = runs.run_id AND p.stage = 'settled'), 0)`,
            // A settled payment in a token with no known USD value makes the total unknown
            spend_known: sql<boolean>`NOT EXISTS (SELECT 1 FROM payments p WHERE p.project_id = runs.project_id AND p.run_id = runs.run_id AND p.stage = 'settled' AND p.usd IS NULL)`,
        })
        .where("project_id", "=", projectId)
        .where("run_id", "in", runIds)
        .execute();
}

// Stores a batch in one transaction. Events already stored are skipped,
// so a resent batch changes nothing. Returns how many events were new.
export async function ingestBatch(db: Db, projectId: string, batch: UploadItem[]): Promise<number> {
    const items = batch.filter(isRunItem);
    if (items.length === 0) {
        return 0;
    }
    return db.transaction().execute(async (trx) => {
        await upsertRuns(trx, projectId, items);
        const inserted = await trx
            .insertInto("events")
            .values(eventRows(projectId, items))
            .onConflict((conflict) => conflict.columns(["project_id", "event_id"]).doNothing())
            .returning("event_id")
            .execute();
        const fresh = new Set(inserted.map((row) => row.event_id));
        const added = items.filter((item) => fresh.has(item.id));
        if (added.length === 0) {
            return 0;
        }
        const steps = stepRows(projectId, added);
        const labels = labelRows(projectId, added);
        const decisions = decisionRows(projectId, added);
        const messages = agentMessageRows(projectId, added);
        const payments = paymentRows(projectId, added);
        if (steps.length > 0) {
            await trx
                .insertInto("steps")
                .values(steps)
                .onConflict((c) => c.doNothing())
                .execute();
        }
        if (labels.length > 0) {
            await trx
                .insertInto("labels")
                .values(labels)
                .onConflict((c) => c.doNothing())
                .execute();
        }
        if (decisions.length > 0) {
            await trx
                .insertInto("decisions")
                .values(decisions)
                .onConflict((c) => c.doNothing())
                .execute();
            await openIncidents(trx, projectId, decisions);
        }
        if (messages.length > 0) {
            await trx
                .insertInto("agent_messages")
                .values(messages)
                .onConflict((c) => c.doNothing())
                .execute();
        }
        if (payments.length > 0) {
            await trx
                .insertInto("payments")
                .values(payments)
                .onConflict((c) => c.doNothing())
                .execute();
        }
        await refreshRuns(trx, projectId, [...new Set(added.map((item) => item.event.runId))]);
        return added.length;
    });
}

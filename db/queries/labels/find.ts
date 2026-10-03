import type { ContextLabelRecord, MemoryRecord, MessageRecord, ValueRecord } from "@quard/shared";
import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";

// The most records one lookup returns, as the "labels" message allows
const MAX_RECORDS = 20;

// The record behind a message's reference, or undefined when none was stored
export async function findMessageRecord(db: Db, projectId: string, ref: string): Promise<MessageRecord | undefined> {
    const row = await db
        .selectFrom("message_records")
        .select(["ref", "run_id", "step_id", "sender", "depth", "print", "label", "value_labels", "tools"])
        .where("project_id", "=", projectId)
        .where("ref", "=", ref)
        .executeTakeFirst();
    if (row === undefined) {
        return undefined;
    }
    return {
        kind: "message",
        ref: row.ref,
        runId: row.run_id,
        ...(row.step_id === null ? {} : { stepId: row.step_id }),
        sender: row.sender,
        depth: row.depth,
        print: row.print,
        label: row.label as ContextLabelRecord,
        values: row.value_labels as ValueRecord[],
        ...(row.tools === null ? {} : { tools: row.tools }),
    };
}

// Every label a memory item was written with: untrusted ones first, then
// the most recently written
export async function findMemoryRecords(db: Db, projectId: string, print: string): Promise<MemoryRecord[]> {
    const rows = await db
        .selectFrom("memory_labels")
        .select(["store", "print", "run_id", "agent", "label", "value_labels"])
        .where("project_id", "=", projectId)
        .where("print", "=", print)
        .orderBy(sql`trust = 'untrusted'`, "desc")
        .orderBy("last_written_at", "desc")
        .orderBy("label_hash")
        .limit(MAX_RECORDS)
        .execute();
    return rows.map((row) => ({
        kind: "memory",
        store: row.store,
        print: row.print,
        runId: row.run_id,
        agent: row.agent,
        label: row.label as ContextLabelRecord,
        values: row.value_labels as ValueRecord[],
    }));
}

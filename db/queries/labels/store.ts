import { createHash } from "node:crypto";
import { canonicalJson, type LabelRecord, type MemoryRecord, type MessageRecord } from "@quard/shared";
import { sql, type Insertable } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { MemoryLabelsTable, MessageRecordsTable } from "../../schema/database.ts";

// Tells the distinct labels of one memory item apart
export function labelHash(record: Pick<MemoryRecord, "label" | "values">): string {
    const text = canonicalJson({ label: record.label, values: record.values });
    return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

// The least trusted of the label and its values, so a lookup can put
// untrusted rows first
function trustOf(record: MemoryRecord): "trusted" | "untrusted" {
    const labels = [record.label, ...record.values];
    return labels.some((label) => label.trust === "untrusted") ? "untrusted" : "trusted";
}

function messageRow(projectId: string, record: MessageRecord): Insertable<MessageRecordsTable> {
    return {
        project_id: projectId,
        ref: record.ref,
        run_id: record.runId,
        step_id: record.stepId ?? null,
        sender: record.sender,
        depth: record.depth,
        print: record.print,
        label: JSON.stringify(record.label),
        value_labels: JSON.stringify(record.values),
        tools: record.tools ?? null,
    };
}

function memoryRow(projectId: string, record: MemoryRecord): Insertable<MemoryLabelsTable> {
    return {
        project_id: projectId,
        print: record.print,
        label_hash: labelHash(record),
        store: record.store,
        run_id: record.runId,
        agent: record.agent,
        trust: trustOf(record),
        label: JSON.stringify(record.label),
        value_labels: JSON.stringify(record.values),
    };
}

// One insert may not update a row twice, so repeats in one upload collapse
function distinctMemoryRows(projectId: string, records: MemoryRecord[]): Insertable<MemoryLabelsTable>[] {
    const rows = new Map<string, Insertable<MemoryLabelsTable>>();
    for (const record of records) {
        const row = memoryRow(projectId, record);
        rows.set(`${row.print}:${row.label_hash}`, row);
    }
    return [...rows.values()];
}

// Stores label records in one transaction. A message record sent again is
// skipped; a memory label written again only moves last_written_at.
// Returns how many rows were added or updated.
export async function storeLabelRecords(db: Db, projectId: string, records: LabelRecord[]): Promise<number> {
    const messages = records
        .filter((record): record is MessageRecord => record.kind === "message")
        .map((record) => messageRow(projectId, record));
    const memory = distinctMemoryRows(
        projectId,
        records.filter((record): record is MemoryRecord => record.kind === "memory"),
    );
    return db.transaction().execute(async (trx) => {
        let stored = 0;
        if (messages.length > 0) {
            const added = await trx
                .insertInto("message_records")
                .values(messages)
                .onConflict((conflict) => conflict.columns(["project_id", "ref"]).doNothing())
                .returning("ref")
                .execute();
            stored += added.length;
        }
        if (memory.length > 0) {
            const written = await trx
                .insertInto("memory_labels")
                .values(memory)
                .onConflict((conflict) =>
                    conflict
                        .columns(["project_id", "print", "label_hash"])
                        .doUpdateSet({ last_written_at: sql<Date>`now()` }),
                )
                .returning("print")
                .execute();
            stored += written.length;
        }
        return stored;
    });
}

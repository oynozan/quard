import type { LabelRecord, MemoryRecord, MessageRecord } from "@quard/shared";
import type { Insertable } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { MessageRecordsTable } from "../../schema/database.ts";
import { writeMemoryLabels } from "./memory.ts";

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

// Stores label records in one transaction. A message record sent again is
// skipped; a memory record merges into its item's row (writeMemoryLabels).
// Returns how many rows were added or updated.
export async function storeLabelRecords(db: Db, projectId: string, records: LabelRecord[]): Promise<number> {
    const messages = records
        .filter((record): record is MessageRecord => record.kind === "message")
        .map((record) => messageRow(projectId, record));
    const memory = records.filter((record): record is MemoryRecord => record.kind === "memory");
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
            stored += await writeMemoryLabels(trx, projectId, memory);
        }
        return stored;
    });
}

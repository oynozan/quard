import type { MemoryRecord } from "@quard/shared";
import { sql, type Transaction } from "kysely";
import type { Database } from "../../schema/database.ts";
import { mergeLabels, type MemoryLabels } from "./merge.ts";

// Records of the same item in one upload merge first. The first writer's
// store, run and agent stay. Sorted by print, so writers lock rows in the
// same order.
function mergeByPrint(records: MemoryRecord[]): MemoryRecord[] {
    const merged = new Map<string, MemoryRecord>();
    for (const record of records) {
        const kept = merged.get(record.print);
        merged.set(record.print, kept === undefined ? record : { ...kept, ...mergeLabels(kept, record) });
    }
    return [...merged.values()].sort((a, b) => (a.print < b.print ? -1 : 1));
}

// Writes one merged row per memory item. A new item is inserted as it
// is. A known one is locked, merged with what it holds and updated, so
// two writers at once both count. Returns how many items were written.
export async function writeMemoryLabels(
    trx: Transaction<Database>,
    projectId: string,
    records: MemoryRecord[],
): Promise<number> {
    const items = mergeByPrint(records);
    const added = await trx
        .insertInto("memory_labels")
        .values(
            items.map((item) => ({
                project_id: projectId,
                print: item.print,
                store: item.store,
                run_id: item.runId,
                agent: item.agent,
                label: JSON.stringify(item.label),
                value_labels: JSON.stringify(item.values),
            })),
        )
        .onConflict((conflict) => conflict.columns(["project_id", "print"]).doNothing())
        .returning("print")
        .execute();
    const fresh = new Set(added.map((row) => row.print));
    const known = items.filter((item) => !fresh.has(item.print));
    if (known.length === 0) {
        return items.length;
    }
    const stored = await trx
        .selectFrom("memory_labels")
        .select(["print", "label", "value_labels"])
        .where("project_id", "=", projectId)
        .where(
            "print",
            "in",
            known.map((item) => item.print),
        )
        .orderBy("print")
        .forUpdate()
        .execute();
    const incoming = new Map(known.map((item) => [item.print, item]));
    for (const row of stored) {
        const held = { label: row.label, values: row.value_labels } as MemoryLabels;
        const merged = mergeLabels(held, incoming.get(row.print) as MemoryRecord);
        await trx
            .updateTable("memory_labels")
            .set({
                label: JSON.stringify(merged.label),
                value_labels: JSON.stringify(merged.values),
                last_written_at: sql<Date>`now()`,
            })
            .where("project_id", "=", projectId)
            .where("print", "=", row.print)
            .execute();
    }
    return items.length;
}

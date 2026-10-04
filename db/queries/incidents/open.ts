import { isRiskyLabel } from "@quard/shared";
import { sql, type Insertable, type Transaction } from "kysely";
import type { Database, DecisionsTable } from "../../schema/database.ts";

type Ruling = Pick<DecisionsTable, "guard" | "rule" | "decision"> & { reason?: string | null };

// A guard found something in content, enforced or only observed: a
// signature, the source scan or the AI detector flagged or stripped it.
// An unknown host alone is not in the content. The detector also flags
// what it failed to check ("unchecked"), so then only a risky label counts.
export function isDetection({ guard, rule, decision, reason }: Ruling): boolean {
    if (decision !== "flag" && decision !== "strip") {
        return false;
    }
    const found = (reason ?? "").split(",");
    if (guard === "signature") {
        return true;
    }
    if (guard !== "source") {
        return false;
    }
    if (rule === "source") {
        return found.some((part) => part !== "unknown_host");
    }
    const failed = found.includes("unchecked") && !found.some(isRiskyLabel);
    return rule.startsWith("detector:") && (decision === "strip" || !failed);
}

// Opens an incident for each run where a guard blocked a call or found
// something in content, enforced or only observed, at the earliest such
// decision. The id comes from the run, the same way the 0008 migration
// made it, so a run keeps its first incident.
export async function openIncidents(
    trx: Transaction<Database>,
    projectId: string,
    decisions: Insertable<DecisionsTable>[],
): Promise<void> {
    const opening = decisions.filter((row) => row.decision === "block" || isDetection(row)).map((row) => row.event_id);
    if (opening.length === 0) {
        return;
    }
    await trx
        .insertInto("incidents")
        .columns(["project_id", "id", "run_id", "opened_at"])
        .expression(
            trx
                .selectFrom("decisions")
                .select([
                    "project_id",
                    sql<string>`'inc_' || left(md5(project_id::text || ':' || run_id), 16)`.as("id"),
                    "run_id",
                    (eb) => eb.fn.min("at").as("opened_at"),
                ])
                .where("project_id", "=", projectId)
                .where("event_id", "in", opening)
                .groupBy(["project_id", "run_id"]),
        )
        .onConflict((conflict) => conflict.doNothing())
        .execute();
}

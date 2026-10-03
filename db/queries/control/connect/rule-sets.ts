import type { RuleEntry } from "@quard/shared";
import type { Db } from "../../../connect/connect.ts";

export type RuleSetRow = { hash: string; rules: RuleEntry[] };

// The project's rule sets with these hashes, by hash
export async function ruleSets(db: Db, projectId: string, hashes: string[]): Promise<RuleSetRow[]> {
    if (hashes.length === 0) {
        return [];
    }
    const rows = await db
        .selectFrom("rule_sets")
        .select(["hash", "rules"])
        .where("project_id", "=", projectId)
        .where("hash", "in", hashes)
        .orderBy("hash")
        .execute();
    // saveRules only stores lists the control protocol checked
    return rows.map((row) => ({ hash: row.hash, rules: row.rules as RuleEntry[] }));
}

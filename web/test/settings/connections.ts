import { openConnection, saveRules, type Db } from "@quard/db";
import type { RuleEntry } from "@quard/shared";

type Session = { host: string; hash: string; rules: RuleEntry[]; at: number; closedAt?: number };

// A connection control stored with the rules its hello reported, moved to fixed times
export async function connected(db: Db, projectId: string, keyId: string, session: Session): Promise<void> {
    const id = await openConnection(db, projectId, { keyId, sdk: "0.4.2", host: session.host, pid: 7 });
    await saveRules(db, projectId, id, { hash: session.hash, list: session.rules });
    const closedAt = session.closedAt === undefined ? null : new Date(session.closedAt);
    await db
        .updateTable("sdk_connections")
        .set({ connected_at: new Date(session.at), disconnected_at: closedAt })
        .where("id", "=", id)
        .execute();
}

// One rule as the SDK reports it
export function entry(tool: string, guard: string, rule: string, mode: RuleEntry["mode"] = "block"): RuleEntry {
    return { tool, guard, rule, mode };
}

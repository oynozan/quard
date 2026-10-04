import { sql } from "kysely";
import type { Db } from "../../connect/connect.ts";
import type { StoredReplay } from "./types.ts";

export type ReplayRequest = "started" | "running" | "decided" | "not_ready" | "not_found";

// Someone asked to replay an incident. A replay that ended with an answer, or
// can't run, stays as it is; one that hit the cost cap goes on when the cap is raised.
export async function requestReplay(
    db: Db,
    projectId: string,
    id: string,
    options: { by: string; raiseCapUsd?: number },
): Promise<ReplayRequest> {
    return db.transaction().execute(async (trx) => {
        const row = await trx
            .selectFrom("incidents")
            .select(["find_state", "replay_state", "replay"])
            .$narrowType<{ replay: StoredReplay | null }>()
            .where("project_id", "=", projectId)
            .where("id", "=", id)
            .forUpdate()
            .executeTakeFirst();
        if (row === undefined) {
            return "not_found";
        }
        if (row.find_state !== "done") {
            return "not_ready";
        }
        if (row.replay_state === "requested" || row.replay_state === "running") {
            return "running";
        }
        const replay = row.replay;
        const capped = replay?.outcome === "cap reached";
        const raise = options.raiseCapUsd ?? 0;
        const answered = replay !== null && (replay.limited !== null || (replay.outcome !== null && !capped));
        if (answered || (capped && !(raise > 0 && Number.isFinite(raise)))) {
            return "decided";
        }
        await trx
            .updateTable("incidents")
            .set({
                replay_state: "requested",
                run_after: sql<Date>`now()`,
                replay_requested_by: options.by,
                cap_usd: sql<number>`cap_usd + ${capped ? raise : 0}`,
                replay: replay === null ? null : JSON.stringify({ ...replay, error: null }),
            })
            .where("project_id", "=", projectId)
            .where("id", "=", id)
            .execute();
        return "started";
    });
}

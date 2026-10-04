import { claimIncidentJob, createProject, ingestBatch, type ClaimedJob, type Db } from "@quard/db";
import { incidentId } from "../../../db/test/incidents.ts";
import { attackItems, RUN, type AttackOptions } from "./attack.ts";

// Stores the M1 attack in a new project. Its blocked payment opens an incident.
export async function storeAttack(db: Db, options: AttackOptions = {}): Promise<{ projectId: string; id: string }> {
    const projectId = await createProject(db, "Acme");
    await ingestBatch(db, projectId, attackItems(options));
    return { projectId, id: incidentId(projectId, RUN) };
}

// Claims the next due job, failing the test when none is due
export async function claim(db: Db): Promise<ClaimedJob> {
    const job = await claimIncidentJob(db, 60_000);
    if (job === undefined) {
        throw new Error("no job is due");
    }
    return job;
}

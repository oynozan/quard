"use server";

import { markIncidentSeen as recordSeen, requestReplay, type ReplayRequest } from "@quard/db";
import { revalidatePath } from "next/cache";
import { displayName } from "@/lib/auth/access";
import { actionScope } from "../scope";

const INCIDENT_ID = /^inc_[0-9a-f]{16}$/;
// What "Continue" adds to the cost cap once a replay reached it
const RAISE_USD = 5;

// Starts an incident's replay, or continues it past the cap. The worker picks it up within a second.
export async function replayIncident(id: string, options?: { raiseCap?: boolean }): Promise<ReplayRequest> {
    const scope = await actionScope();
    if (typeof id !== "string" || !INCIDENT_ID.test(id)) {
        throw new Error("Not an incident id");
    }
    const raiseCapUsd = options?.raiseCap === true ? RAISE_USD : undefined;
    const result = scope
        ? await requestReplay(scope.db, scope.project.id, id, { by: displayName(scope.session), raiseCapUsd })
        : "not_found";
    revalidatePath(`/incidents/${id}`);
    return result;
}

// Someone opened the incident's page, so the list stops outlining it
export async function markIncidentSeen(id: string): Promise<void> {
    const scope = await actionScope();
    if (typeof id !== "string" || !INCIDENT_ID.test(id)) {
        throw new Error("Not an incident id");
    }
    if (scope) await recordSeen(scope.db, scope.project.id, id);
    revalidatePath("/incidents");
}

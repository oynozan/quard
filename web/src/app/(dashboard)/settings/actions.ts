"use server";

import { createAgentKey, createProject, listAgentKeys, revokeAgentKey } from "@quard/db";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { sameOrigin } from "@/lib/auth/origin";
import { getSession } from "@/lib/auth/session";
import { database } from "@/lib/data/runs/live/client";
import { currentProject } from "@/lib/data/runs/live/project";
import { nameProblem } from "@/lib/data/settings/key-name";
import type { CreateKeyResult, RevokeKeyResult } from "@/lib/data/settings/types";

const SIGN_IN = "Sign in again to change agent keys.";

// Only a signed-in person on this site may change keys
async function allowed(): Promise<boolean> {
    return sameOrigin(await headers()) && (await getSession()) !== null;
}

// Returns the secret once and never logs it, since only its hash is stored
export async function createKey(name: string): Promise<CreateKeyResult> {
    if (!(await allowed())) return { error: SIGN_IN };
    const db = database();
    const project = await currentProject(db);
    const keys = project ? await listAgentKeys(db, project.id) : [];
    const taken = keys.filter((key) => key.revokedAt === null).map((key) => key.name);
    // The name comes from the browser, so it is checked again here
    const value = typeof name === "string" ? name.trim() : "";
    const problem = nameProblem(value, taken);
    if (problem) return { error: problem };
    // A set QUARD_PROJECT_ID that matches no project is a setup mistake, not a new install
    if (!project && process.env.QUARD_PROJECT_ID?.trim()) return { error: "QUARD_PROJECT_ID names no project." };
    // A new install has no project yet, so its first key makes one
    const projectId = project?.id ?? (await createProject(db, "Default"));
    const { id, key, prefix } = await createAgentKey(db, projectId, value);
    refresh();
    return { key: { id, name: value, prefix }, secret: key };
}

// Revokes an active key of the current project, which refuses its agents from then on
export async function revokeKey(id: string): Promise<RevokeKeyResult> {
    if (!(await allowed())) return { error: SIGN_IN };
    const db = database();
    const project = await currentProject(db);
    const revoked = project !== undefined && (await revokeAgentKey(db, project.id, id));
    // Shows what is true now, also when another tab revoked the key first
    refresh();
    return revoked ? { ok: true } : { error: "This key is already revoked or no longer exists." };
}

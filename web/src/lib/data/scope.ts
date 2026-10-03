import "server-only";
import type { Db, Project } from "@quard/db";
import { connection } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { database } from "./runs/live/client";
import { currentProject } from "./runs/live/project";

export type ProjectScope = { db: Db; project: Project };

// The time of this request, for ages and running durations
export async function requestTime(): Promise<number> {
    await connection();
    return Date.now();
}

// Reads are per request and only for signed-in people, so nothing is cached at build time
export async function projectScope(): Promise<ProjectScope | null> {
    await connection();
    await requireSession();
    const db = database();
    const project = await currentProject(db);
    return project ? { db, project } : null;
}

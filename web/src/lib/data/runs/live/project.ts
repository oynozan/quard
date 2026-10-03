import { findProject, firstProject, type Db, type Project } from "@quard/db";

// The project the dashboard shows: QUARD_PROJECT_ID when set, else the install's first project.
export async function currentProject(
    db: Db,
    env: Record<string, string | undefined> = process.env,
): Promise<Project | undefined> {
    const id = env.QUARD_PROJECT_ID?.trim();
    return id ? findProject(db, id) : firstProject(db);
}

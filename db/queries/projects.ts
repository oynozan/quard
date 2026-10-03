import type { Db } from "../connect/connect.ts";

export type Project = { id: string; name: string };

export async function createProject(db: Db, name: string): Promise<string> {
    const row = await db.insertInto("projects").values({ name }).returning("id").executeTakeFirstOrThrow();
    return row.id;
}

export async function findProject(db: Db, id: string): Promise<Project | undefined> {
    return db.selectFrom("projects").select(["id", "name"]).where("id", "=", id).executeTakeFirst();
}

// The oldest project. A self-hosted install usually has just one.
export async function firstProject(db: Db): Promise<Project | undefined> {
    return db
        .selectFrom("projects")
        .select(["id", "name"])
        .orderBy("created_at")
        .orderBy("id")
        .limit(1)
        .executeTakeFirst();
}

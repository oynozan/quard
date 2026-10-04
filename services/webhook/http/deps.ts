import type { Db } from "@quard/db";
import type { ProjectKeys } from "@quard/db/server";

// What the routes for agents work with
export type WebhookDeps = { db: Db; keys: ProjectKeys };

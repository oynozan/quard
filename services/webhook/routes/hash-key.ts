import { HASH_KEY_PATH, type HashKeyReply } from "@quard/shared";
import { Hono } from "hono";
import type { WebhookDeps } from "../http/deps.ts";
import { projectFor } from "../http/request.ts";

// The project's hash key for its agents, so they never need the install's
export function hashKeyRoutes(deps: WebhookDeps): Hono {
    return new Hono().get(HASH_KEY_PATH, async (c) => {
        const projectId = await projectFor(deps.db, c.req.header("authorization"));
        if (projectId === undefined) {
            return c.json({ error: "invalid_agent_key" }, 401);
        }
        const reply: HashKeyReply = { hashKey: deps.keys.hashKey(projectId) };
        // A secret, so no cache on the way keeps a copy
        c.header("cache-control", "no-store");
        return c.json(reply);
    });
}

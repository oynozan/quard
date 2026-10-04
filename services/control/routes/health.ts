import { lastWorkerSeen } from "@quard/db";
import { Hono } from "hono";
import type { Context } from "../server/context.ts";

// Also says when a worker last checked in, as the worker answers no requests itself
export function healthRoutes(ctx: Pick<Context, "db" | "log">, service: string): Hono {
    return new Hono().get("/health", async (c) => {
        const seen = await lastWorkerSeen(ctx.db).catch((error: unknown) => {
            ctx.log(`control: could not read when a worker was last seen: ${(error as Error).message}`);
            return null;
        });
        return c.json({ status: "ok", service, workerSeenAt: seen?.toISOString() ?? null });
    });
}

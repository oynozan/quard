import { Hono } from "hono";

export function healthRoutes(service: string): Hono {
    return new Hono().get("/health", (c) => c.json({ status: "ok", service }));
}

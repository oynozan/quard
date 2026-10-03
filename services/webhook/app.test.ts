import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";

describe("webhook app", () => {
    it("serves the health route", async () => {
        const res = await createApp().request("/health");

        expect(await res.json()).toEqual({ status: "ok", service: "webhook" });
    });

    it("serves events only when it has a database", async () => {
        const res = await createApp().request("/v1/events", { method: "POST" });

        expect(res.status).toBe(404);
    });

    it("returns 404 for unknown paths", async () => {
        const res = await createApp().request("/nope");

        expect(res.status).toBe(404);
    });
});

import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";

describe("webhook app", () => {
    it("serves the health route", async () => {
        const res = await createApp().request("/health");

        expect(await res.json()).toEqual({ status: "ok", service: "webhook" });
    });

    it.each([
        ["POST", "/v1/events"],
        ["POST", "/v1/labels"],
        ["GET", "/v1/hash-key"],
    ])("serves %s %s only when it has a database", async (method, path) => {
        const res = await createApp().request(path, { method });

        expect(res.status).toBe(404);
    });

    it("returns 404 for unknown paths", async () => {
        const res = await createApp().request("/nope");

        expect(res.status).toBe(404);
    });
});

import { describe, expect, it } from "vitest";
import { healthRoutes } from "./health.ts";

describe("health route", () => {
    it("reports the service as ok", async () => {
        const res = await healthRoutes("control").request("/health");

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: "ok", service: "control" });
    });
});

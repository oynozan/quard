// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
    it("answers at once with no body, and is never cached", async () => {
        const response = GET();
        expect(response.status).toBe(204);
        expect(await response.text()).toBe("");
        expect(response.headers.get("Cache-Control")).toBe("no-store");
    });
});

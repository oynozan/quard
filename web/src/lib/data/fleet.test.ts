// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// The Postgres read is a boundary, and this file only passes it through
const query = vi.hoisted(() => ({ getFleet: vi.fn() }));
vi.mock("./fleet/query", () => query);

const fleet = await import("./fleet");

describe("fleet data", () => {
    it("exposes the summary page's query", () => {
        expect(fleet.getFleet).toBe(query.getFleet);
    });
});

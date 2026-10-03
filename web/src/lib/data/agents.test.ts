// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn() }));

const agents = await import("./agents");
const query = await import("./agents/query");

describe("agents data", () => {
    it("exposes only the reads from Postgres", () => {
        expect(Object.keys(agents).sort()).toEqual(["getAgent", "getAgentGraph"]);
        expect(agents.getAgent).toBe(query.getAgent);
        expect(agents.getAgentGraph).toBe(query.getAgentGraph);
    });
});

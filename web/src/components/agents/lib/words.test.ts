// @vitest-environment node
import { describe, expect, it } from "vitest";
import { edge } from "../../../../test/agents-lib-detail/fixtures";
import { edgeKind, plural, ROLE_WORD, STATE_TONE, STATE_WORD } from "./words";

describe("plural", () => {
    it("uses the single word only for one", () => {
        expect(plural(1, "run")).toBe("run");
        expect(plural(0, "run")).toBe("runs");
        expect(plural(2, "run")).toBe("runs");
    });

    it("takes an irregular plural", () => {
        expect(plural(3, "policy", "policies")).toBe("policies");
    });
});

describe("edgeKind", () => {
    it("names the kind with the most traffic", () => {
        expect(edgeKind(edge("a", "b", { delegations: 5, handoffs: 2 }))).toBe("Delegation");
        expect(edgeKind(edge("a", "b", { delegations: 1, handoffs: 4 }))).toBe("Handoff");
        expect(edgeKind(edge("a", "b", { handoffs: 1, messages: 9 }))).toBe("Message");
    });

    it("prefers delegation on a tie", () => {
        expect(edgeKind(edge("a", "b", { delegations: 3, handoffs: 3, messages: 3 }))).toBe("Delegation");
    });

    it("falls back to message for an empty link", () => {
        expect(edgeKind(edge("a", "b"))).toBe("Message");
    });
});

describe("word tables", () => {
    it("names each agent state and its tone", () => {
        expect(STATE_WORD).toEqual({ running: "Running", idle: "Idle" });
        expect(STATE_TONE).toEqual({ running: "on", idle: "context" });
        expect(ROLE_WORD.turning).toBe("Turning point");
    });
});

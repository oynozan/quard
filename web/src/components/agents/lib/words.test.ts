// @vitest-environment node
import { describe, expect, it } from "vitest";
import { edge } from "../../../../test/agents-lib-detail/fixtures";
import { edgeKind, edgeKinds, plural, ROLE_WORD, STATE_TONE, STATE_WORD } from "./words";

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

describe("edgeKinds", () => {
    it("lists every kind a link carries with grouped counts", () => {
        const link = edge("a", "b", { delegations: 3020, handoffs: 1, messages: 12 });
        expect(edgeKinds(link)).toBe("3,020 delegations, 1 handoff, 12 messages");
    });

    it("skips kinds with no traffic", () => {
        expect(edgeKinds(edge("a", "b", { delegations: 1 }))).toBe("1 delegation");
        expect(edgeKinds(edge("a", "b", { messages: 1 }))).toBe("1 message");
    });

    it("says so when a link carried nothing", () => {
        expect(edgeKinds(edge("a", "b"))).toBe("No traffic");
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
        expect(STATE_WORD).toEqual({ running: "Running", idle: "Idle", offline: "Offline" });
        expect(STATE_TONE.offline).toBe("off");
        expect(ROLE_WORD.turning).toBe("Turning point");
    });
});

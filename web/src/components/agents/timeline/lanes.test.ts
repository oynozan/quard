// @vitest-environment node
import { describe, expect, it } from "vitest";
import { agentCall } from "../../../../test/agents-graph-timeline/fixtures";
import { fitTimeline, lanesFor, markColor, markOf, outcomeWord } from "./lanes";

describe("lanesFor", () => {
    it("keeps only the lanes the calls use, in the fixed order", () => {
        const calls = [agentCall("a", { kind: "memory_read" }), agentCall("b", { kind: "model_call" })];
        expect(lanesFor(calls).map((lane) => lane.word)).toEqual(["Model calls", "Memory"]);
    });

    it("puts handoffs in the message lane and both memory kinds in one lane", () => {
        const calls = [
            agentCall("a", { kind: "handoff" }),
            agentCall("b", { kind: "memory_read" }),
            agentCall("c", { kind: "memory_write" }),
        ];
        expect(lanesFor(calls).map((lane) => lane.short)).toEqual(["Message", "Memory"]);
    });

    it("has no lanes without calls", () => {
        expect(lanesFor([])).toEqual([]);
    });
});

describe("markOf", () => {
    it("marks what a guard did in block mode", () => {
        expect(markOf(agentCall("a", { outcome: "block", mode: "block" }))).toBe("block");
        expect(markOf(agentCall("a", { outcome: "ask", mode: "block" }))).toBe("ask");
    });

    it("marks what a guard would have done in observe mode", () => {
        expect(markOf(agentCall("a", { outcome: "block", mode: "observe" }))).toBe("would-block");
        expect(markOf(agentCall("a", { outcome: "ask", mode: "observe" }))).toBe("would-ask");
    });

    it("marks a blocked step that carries no guard outcome as blocked", () => {
        expect(markOf(agentCall("a", { status: "blocked" }))).toBe("block");
    });

    it("leaves allowed and unguarded calls unmarked", () => {
        expect(markOf(agentCall("a", { outcome: "allow", mode: "block" }))).toBeNull();
        expect(markOf(agentCall("a"))).toBeNull();
    });
});

describe("outcomeWord", () => {
    it("says what the guard did, or would have done", () => {
        expect(outcomeWord(agentCall("a", { outcome: "block", mode: "block" }))).toBe("Blocked");
        expect(outcomeWord(agentCall("a", { outcome: "block", mode: "observe" }))).toBe("Would block");
    });

    it("shows a dash when no guard ran", () => {
        expect(outcomeWord(agentCall("a"))).toBe("—");
    });
});

describe("markColor", () => {
    it("draws blocks in the danger color and asks in the warning color", () => {
        expect(markColor("block")).toBe("var(--danger)");
        expect(markColor("would-block")).toBe("var(--danger)");
        expect(markColor("ask")).toBe("var(--warning)");
        expect(markColor("would-ask")).toBe("var(--warning)");
    });
});

describe("fitTimeline", () => {
    it("shows a few calls at the widest pitch on a wide pane", () => {
        expect(fitTimeline(900, 3)).toEqual({ shown: 3, pitch: 14, cell: 12, labelWidth: 110, rowHeight: 18 });
    });

    it("shrinks the pitch to fit more calls but never below a 4px cell", () => {
        expect(fitTimeline(900, 100)).toEqual({ shown: 100, pitch: 7, cell: 5, labelWidth: 110, rowHeight: 18 });
        expect(fitTimeline(900, 200)).toEqual({ shown: 131, pitch: 6, cell: 4, labelWidth: 110, rowHeight: 18 });
    });

    it("uses a narrower label column on small screens", () => {
        expect(fitTimeline(500, 10).labelWidth).toBe(66);
        expect(fitTimeline(560, 10).labelWidth).toBe(110);
    });

    it("shows nothing when there are no calls or no room", () => {
        expect(fitTimeline(500, 0).shown).toBe(0);
        expect(fitTimeline(40, 5)).toEqual({ shown: 0, pitch: 6, cell: 4, labelWidth: 66, rowHeight: 18 });
    });
});

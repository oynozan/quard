import type { RunAgentEvent } from "@quard/db";
import { describe, expect, it } from "vitest";
import { at, BASE, M1, M2, storedRun, T1 } from "../../../../../test/runs-fixture";
import { runDetailOf } from "./detail";

const events: RunAgentEvent[] = [
    {
        type: "handoff",
        eventId: "f".repeat(16),
        stepId: M2,
        agent: "billing",
        at: at(5.2),
        to: "researcher",
        via: "tool",
        trust: "untrusted",
        sensitivity: "public",
    },
    {
        type: "message",
        eventId: "e".repeat(16),
        stepId: T1,
        agent: "billing",
        at: at(3.5),
        from: "unknown",
        parentStepId: null,
        labelRef: null,
        verified: false,
        trust: "untrusted",
        sensitivity: "internal",
    },
];

describe("runDetailOf with messages and handoffs", () => {
    it("places them among the steps in time order and draws them as the run graph's edges", () => {
        const detail = runDetailOf({ ...storedRun(), events }, BASE + 60_000);
        const ids = detail.steps.map((step) => step.id);

        expect(ids.indexOf("e".repeat(16))).toBe(ids.indexOf(T1) + 2);
        expect(ids.indexOf("f".repeat(16))).toBeGreaterThan(ids.indexOf(M2));
        expect(ids.indexOf(M1)).toBe(0);
        expect(detail.graph.edges.map((edge) => [edge.kind, edge.from, edge.to, edge.untrusted])).toEqual([
            ["message", "unknown", "billing", true],
            ["delegation", "billing", "researcher", true],
        ]);
    });
});

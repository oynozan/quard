// @vitest-environment node
import type { DecisionRow } from "@quard/db";
import { describe, expect, it } from "vitest";
import { MINUTE, NOW } from "../../../../test/time";
import { buildSteps } from "../runs/live/steps";
import { decisionLog } from "./decisions";

let next = 0;

// One stored decision as latestDecisions returns it
function row(fields: Partial<DecisionRow> = {}): DecisionRow {
    next += 1;
    return {
        eventId: next.toString(16).padStart(16, "e"),
        runId: "a".repeat(32),
        stepId: "b".repeat(16),
        agent: "billing",
        tool: "payInvoice",
        guard: "action",
        rule: "iban:from",
        decision: "block",
        mode: "block",
        enforced: true,
        reason: "value_not_from_allowed_origin",
        field: "iban",
        at: new Date(NOW - MINUTE),
        ...fields,
    };
}

describe("decisionLog", () => {
    it("turns newest-first rows into log lines, oldest first, keyed by their event id", () => {
        const newer = row({ at: new Date(NOW - MINUTE) });
        const older = row({ at: new Date(NOW - 2 * MINUTE), agent: "support", tool: "lookup" });

        expect(decisionLog([newer, older])).toEqual([
            {
                id: older.eventId,
                at: NOW - 2 * MINUTE,
                agent: "support",
                tool: "lookup",
                guard: "action",
                outcome: "block",
                runId: older.runId,
                detail: "value not from allowed origin",
            },
            {
                id: newer.eventId,
                at: NOW - MINUTE,
                agent: "billing",
                tool: "payInvoice",
                guard: "action",
                outcome: "block",
                runId: newer.runId,
                detail: "value not from allowed origin",
            },
        ]);
    });

    it("words reasons as the run timeline does, and falls back to the decision", () => {
        const steps = (decision: DecisionRow) => buildSteps({ steps: [], labels: [], decisions: [decision] });
        const flagged = row({ guard: "source", decision: "flag", reason: "instructions,unknown_host" });
        const allowed = row({ guard: "egress", decision: "allow", reason: null });

        const [flagLine, allowLine] = decisionLog([allowed, flagged]);

        expect(flagLine.detail).toBe("instructions, unknown host");
        expect(flagLine.detail).toBe(steps(flagged)[0].detail);
        expect(allowLine.detail).toBe("allow");
        expect(allowLine.detail).toBe(steps(allowed)[0].detail);
    });

    it("shows what observe mode let happen and what the rule would have done", () => {
        const lines = decisionLog([
            row({ mode: "observe", enforced: false, guard: "action", decision: "block" }),
            row({ mode: "observe", enforced: false, guard: "approval", decision: "ask", reason: "approval_required" }),
            row({ mode: "observe", enforced: false, guard: "source", decision: "strip", reason: "instructions" }),
            row({ mode: "observe", enforced: false, guard: "source", decision: "pass", reason: null }),
            row({ mode: "observe", enforced: false, guard: "egress", decision: "allow", reason: null }),
        ]).reverse();

        expect(lines.map((line) => [line.guard, line.outcome, line.detail])).toEqual([
            ["action", "allow", "would block · value not from allowed origin"],
            ["approval", "allow", "would ask · approval required"],
            ["source", "pass", "would strip · instructions"],
            ["source", "pass", "pass"],
            ["egress", "allow", "allow"],
        ]);
    });

    it("keeps every guard the SDK records and leaves out names it does not know", () => {
        const guards = ["source", "action", "approval", "egress", "limit", "permission", "signature", "budget"];
        const lines = decisionLog(guards.map((guard) => row({ guard })));

        expect(lines.map((line) => line.guard).reverse()).toEqual(guards.slice(0, 7));
    });

    it("has no lines without decisions", () => {
        expect(decisionLog([])).toEqual([]);
    });
});

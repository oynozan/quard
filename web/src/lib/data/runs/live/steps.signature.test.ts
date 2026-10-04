import type { RunDetail } from "@quard/db";
import { describe, expect, it } from "vitest";
import { at, storedRun, T2 } from "../../../../../test/runs-fixture";
import { runDetailOf } from "./detail";
import { buildSteps } from "./steps";

// The stored run with one more check on payInvoice, from the given guard
function runWith(guard: string): RunDetail {
    const run = storedRun();
    run.decisions.push({
        ...run.decisions[2]!,
        eventId: "e00000000000000d",
        stepId: T2,
        guard,
        rule: "PROMPT-INJECTION-1",
        decision: "block",
        reason: "signature_matched",
        field: "PROMPT-INJECTION-1",
        at: at(6),
    });
    return run;
}

describe("signature checks in a run", () => {
    it("shows a signature from the feed under the call it blocked", () => {
        const checks = buildSteps(runWith("signature")).filter((step) => step.guard?.guard === "signature");

        expect(checks).toEqual([
            expect.objectContaining({
                parentId: T2,
                kind: "guard_decision",
                name: "PROMPT-INJECTION-1",
                status: "blocked",
                detail: "signature matched",
                guard: expect.objectContaining({
                    tool: "payInvoice",
                    outcome: "block",
                    mode: "block",
                    reason: "signature_matched",
                    scan: null,
                }),
            }),
        ]);
    });

    it("counts a signature block in the run's summary and steps", () => {
        const summary = runDetailOf(runWith("signature"), at(60).getTime()).summary;

        expect(summary).toMatchObject({ steps: 12, decisions: { allowed: 3, asked: 1, blocked: 2 } });
    });

    it("leaves out the checks of a guard the dashboard does not know", () => {
        const summary = runDetailOf(runWith("budget"), at(60).getTime()).summary;

        expect(summary).toMatchObject({ steps: 11, decisions: { allowed: 3, asked: 1, blocked: 1 } });
    });
});

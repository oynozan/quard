import { describe, expect, it } from "vitest";
import { summaryLines, type SandboxResult } from "./result.ts";

const RESULT: SandboxResult = {
    runId: "ab".repeat(16),
    status: "completed",
    answer: "Paid.",
    error: null,
    recorded: true,
    detections: [],
    timing: {
        totalMs: 5040,
        modelMs: 4990,
        modelCalls: 3,
        checks: [
            { tool: "readEmail", ms: 7 },
            { tool: "payInvoice", ms: 3 },
        ],
    },
    tokens: { input: 10, output: 5 },
};

describe("summaryLines", () => {
    it("says nothing was found, where the run went and how long it took", () => {
        expect(summaryLines(RESULT)).toEqual([
            "Result: completed",
            "Detected: nothing",
            `Sent to the dashboard as run ${RESULT.runId}. A block or flagged content opens an incident there.`,
            "Time: 5.0 s in all, 5.0 s in 3 model calls, 10 ms in Quard over 2 tool calls (slowest 7 ms)",
        ]);
    });

    it("lists each detection, enforced or observed, and the error of a run that was not sent", () => {
        const lines = summaryLines({
            ...RESULT,
            status: "failed",
            error: "Boom",
            recorded: false,
            detections: [
                {
                    tool: "readEmail",
                    guard: "source",
                    rule: "source",
                    decision: "flag",
                    enforced: true,
                    reason: "instructions,invisible_text",
                },
                { tool: null, guard: "limit", rule: "max-steps", decision: "block", enforced: false, reason: null },
            ],
            timing: { ...RESULT.timing, checks: [] },
        });
        expect(lines).toEqual([
            "Result: failed, Boom",
            "Detected:",
            "  readEmail: source guard, rule source, flag: instructions, invisible_text",
            "  the run: limit guard, rule max-steps, would block (observe mode)",
            "Not sent to the dashboard: set QUARD_AGENT_KEY in sandbox/.env and start webhook.",
            "Time: 5.0 s in all, 5.0 s in 3 model calls, no tool calls",
        ]);
    });
});

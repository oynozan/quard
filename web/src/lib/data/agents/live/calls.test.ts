// @vitest-environment node
import { describe, expect, it } from "vitest";
import { WEB_PAGE } from "../../../../../test/agents/events";
import { at, decision, label, run, step } from "../../../../../test/agents/rows";
import { NOW } from "../../../../../test/time";
import { timelineOf } from "./calls";

const NEW = "a".repeat(32);
const OLD = "b".repeat(32);
const [M1, T1, T2, T3, M2] = ["1", "2", "3", "4", "5"].map((digit) => digit.repeat(16));

// The newer run has a model call that read a web page, then three tool calls with different checks
const newer = run(NEW, {
    steps: [
        step({
            stepId: M1,
            kind: "model_call",
            at: at(2),
            detail: { toolCalls: [{ callId: "c1", name: "payInvoice" }] },
        }),
        step({ stepId: T1, kind: "tool_call", at: at(3), callId: "c1", durationMs: 10 }),
        step({ stepId: T2, kind: "tool_call", at: at(5), durationMs: 10 }),
        step({ stepId: T3, kind: "tool_call", at: at(6), durationMs: 10 }),
    ],
    labels: [label({ contentId: "page", stepId: "f".repeat(16), at: at(0) })],
    decisions: [
        decision({ stepId: T1, at: at(2.5), guard: "approval", rule: "approval", decision: "ask" }),
        decision({ stepId: T1, at: at(2.5), guard: "limit", decision: "block", mode: "observe", enforced: false }),
        decision({ stepId: T2, at: at(4.99), decision: "block", mode: "observe", enforced: false }),
        decision({ stepId: T2, at: at(4.99), decision: "block" }),
        decision({ stepId: T3, at: at(5.99), guard: "permission", rule: "requested-call", decision: "allow" }),
    ],
});

// The older run has one failed model call, with nothing read before it
const older = run(OLD, { steps: [step({ stepId: M2, kind: "model_call", at: at(-10), status: "error" })] });

describe("timelineOf", () => {
    it("lists the model and tool calls of every run, newest first, each with its run", () => {
        const calls = timelineOf([newer, older]);
        expect(calls.map((call) => [call.runId, call.stepId])).toEqual([
            [NEW, T3],
            [NEW, T2],
            [NEW, T1],
            [NEW, M1],
            [OLD, M2],
        ]);
    });

    it("keeps a call's start, kind, name, duration, status and context", () => {
        const calls = timelineOf([newer, older]);
        expect(calls[2]).toMatchObject({
            at: NOW + 2_500,
            kind: "tool_call",
            name: "payInvoice",
            durationMs: 500,
            status: "ok",
            context: WEB_PAGE,
        });
        expect(calls[3]).toMatchObject({ at: NOW + 1_000, kind: "model_call", name: "gpt-5.4-mini" });
        expect(calls[4]).toMatchObject({
            at: NOW - 11_000,
            status: "error",
            context: { origin: "instructions", trust: "trusted" },
        });
    });

    it("gives each call its strictest check, ranking the outcome before the mode", () => {
        const [t3, t2, t1, m1] = timelineOf([newer]);
        // A rule that would block outranks an ask that paused the call
        expect([t1.outcome, t1.mode]).toEqual(["block", "observe"]);
        // Of two blocks, the enforced one wins whatever came first
        expect([t2.outcome, t2.mode]).toEqual(["block", "block"]);
        // A permission check that let the call through is not shown
        expect([t3.outcome, t3.mode, m1.outcome]).toEqual([null, null, null]);
    });

    it("keeps the enforced block when an observed one comes after it", () => {
        const blocked = run(NEW, {
            steps: [step({ stepId: T1, kind: "tool_call", at: at(3) })],
            decisions: [
                decision({ stepId: T1, at: at(2), decision: "block" }),
                decision({ stepId: T1, at: at(2), decision: "block", mode: "observe", enforced: false }),
            ],
        });
        expect(timelineOf([blocked])[0]).toMatchObject({ outcome: "block", mode: "block" });
    });

    it("names the approval guard's ask without a mode", () => {
        const asked = run(NEW, {
            steps: [step({ stepId: T1, kind: "tool_call", at: at(3) })],
            decisions: [decision({ stepId: T1, at: at(2), guard: "approval", rule: "approval", decision: "ask" })],
        });
        expect(timelineOf([asked])[0]).toMatchObject({ outcome: "ask", mode: null });
    });

    it("puts a tool call after the model call that asked for it at the same moment", () => {
        const same = run(NEW, {
            steps: [
                step({
                    stepId: M1,
                    kind: "model_call",
                    at: at(20),
                    durationMs: 0,
                    detail: { toolCalls: [{ callId: "c9", name: "payInvoice" }] },
                }),
                step({ stepId: T1, kind: "tool_call", at: at(20), durationMs: 0, callId: "c9" }),
            ],
        });
        expect(timelineOf([same]).map((call) => call.kind)).toEqual(["tool_call", "model_call"]);
    });

    it("has no calls for no runs", () => {
        expect(timelineOf([])).toEqual([]);
    });
});

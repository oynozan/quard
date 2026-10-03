// @vitest-environment node
import { describe, expect, it } from "vitest";
import { makeGuard, makeStep } from "../../../../../test/runs-timeline-lib/steps";
import { decisionWord, formatOffset, formatStepDuration, stepMark } from "./words";

describe("decisionWord", () => {
    it("says what an enforced decision did", () => {
        expect(decisionWord(makeGuard({ outcome: "block", mode: "block" }))).toBe("Blocked");
        expect(decisionWord(makeGuard({ outcome: "ask", mode: "block" }))).toBe("Asked a human");
        expect(decisionWord(makeGuard({ outcome: "ask", mode: null }))).toBe("Asked a human");
        expect(decisionWord(makeGuard({ outcome: "allow" }))).toBe("Allowed");
        expect(decisionWord(makeGuard({ outcome: "pass" }))).toBe("Passed");
        expect(decisionWord(makeGuard({ outcome: "strip" }))).toBe("Stripped");
        expect(decisionWord(makeGuard({ outcome: "flag" }))).toBe("Flagged");
    });

    it("says what observe mode would have done", () => {
        expect(decisionWord(makeGuard({ outcome: "block", mode: "observe" }))).toBe("Would block");
        expect(decisionWord(makeGuard({ outcome: "ask", mode: "observe" }))).toBe("Would ask");
        expect(decisionWord(makeGuard({ outcome: "allow", mode: "observe" }))).toBe("Allowed");
    });
});

describe("stepMark", () => {
    it("marks a guard block, solid when enforced and outlined in observe mode", () => {
        expect(stepMark(makeStep({ guard: makeGuard({ outcome: "block" }) }))).toBe("block");
        expect(stepMark(makeStep({ guard: makeGuard({ outcome: "block", mode: "observe" }) }))).toBe("would-block");
    });

    it("marks a guard that asks a human", () => {
        expect(stepMark(makeStep({ guard: makeGuard({ outcome: "ask", mode: null }) }))).toBe("ask");
        expect(stepMark(makeStep({ guard: makeGuard({ outcome: "ask", mode: "observe" }) }))).toBe("would-ask");
    });

    it("lets the guard outcome win over the step status", () => {
        const step = makeStep({ status: "error", guard: makeGuard({ outcome: "ask", mode: "observe" }) });
        expect(stepMark(step)).toBe("would-ask");
    });

    it("marks failed, blocked and waiting steps without a deciding guard", () => {
        expect(stepMark(makeStep({ status: "error" }))).toBe("block");
        expect(stepMark(makeStep({ status: "blocked" }))).toBe("block");
        expect(stepMark(makeStep({ status: "waiting", guard: makeGuard({ outcome: "allow" }) }))).toBe("ask");
    });

    it("leaves ok and running steps unmarked", () => {
        expect(stepMark(makeStep({ status: "ok" }))).toBeNull();
        expect(stepMark(makeStep({ status: "running" }))).toBeNull();
    });
});

describe("formatOffset", () => {
    it("shows two decimals under a second", () => {
        expect(formatOffset(0)).toBe("0.00 s");
        expect(formatOffset(420)).toBe("0.42 s");
    });

    it("shows one decimal under a minute", () => {
        expect(formatOffset(1000)).toBe("1.0 s");
        expect(formatOffset(9240)).toBe("9.2 s");
    });

    it("shows minutes and whole seconds from a minute on", () => {
        expect(formatOffset(60_000)).toBe("1 min 0 s");
        expect(formatOffset(255_400)).toBe("4 min 15 s");
    });
});

describe("formatStepDuration", () => {
    it("shows milliseconds under a second, and the offset style above", () => {
        expect(formatStepDuration(0)).toBe("0 ms");
        expect(formatStepDuration(999)).toBe("999 ms");
        expect(formatStepDuration(1500)).toBe("1.5 s");
        expect(formatStepDuration(75_000)).toBe("1 min 15 s");
    });
});

import { describe, expect, it } from "vitest";
import { at, BASE, CHILD, M1, M2, M3, storedRun, T1, T2 } from "../../../../../test/runs-fixture";
import { buildSteps } from "./steps";

const byId = (id: string) => buildSteps(storedRun()).find((step) => step.id === id);

describe("buildSteps", () => {
    it("orders model calls, tool calls and their checks in time, leaving permission checks out", () => {
        const steps = buildSteps(storedRun());

        expect(steps.map((step) => (step.kind === "guard_decision" ? `${step.guard?.guard}` : step.id))).toEqual([
            M1,
            T1,
            "source",
            M2,
            CHILD,
            T2,
            "action",
            "limit",
            "approval",
            "source",
            M3,
        ]);
    });

    it("starts a model call at its end minus its duration, with its own input in its context", () => {
        expect(byId(M1)).toMatchObject({
            kind: "model_call",
            startedAt: BASE + 1000,
            durationMs: 1000,
            status: "ok",
            detail: "Asked for fetchPage",
            context: { origin: "system", trust: "trusted", sensitivity: "internal" },
            model: {
                model: "gpt-5.4-mini",
                toolCalls: ["fetchPage"],
                inputTokens: 2000,
                cachedTokens: 1000,
                outputTokens: 500,
                costUsd: 0.0031,
                costKnown: true,
            },
            error: null,
        });
    });

    it("marks a failed model call and reads tool calls defensively", () => {
        expect(byId(M3)).toMatchObject({ status: "error", detail: "Answered", error: "The model call failed." });
        // A failed call is not billed; an answered call without a price makes the cost unknown
        expect(byId(M3)?.model).toMatchObject({ costUsd: 0, costKnown: true });
        expect(byId(M2)?.model).toMatchObject({ inputTokens: 0, costUsd: 0, costKnown: false });
        expect(byId(CHILD)).toMatchObject({ parentId: M2, agent: "researcher", detail: "Answered" });
        expect(byId(M2)?.model?.toolCalls).toEqual(["payInvoice"]);
    });

    it("links a tool call to the model call that asked for it, and keeps its output out of its context", () => {
        expect(byId(T1)).toMatchObject({
            kind: "tool_call",
            parentId: M1,
            startedAt: at(2.8).getTime(),
            durationMs: 200,
            context: { trust: "trusted" },
            output: { label: { origin: "web:acme-billing.net", trust: "untrusted" }, summary: "" },
            detail: "url https://acme-billing.net/invoices/114",
        });
    });

    it("starts a blocked call at its first check, and traces its IBAN to the web page", () => {
        const pay = byId(T2);

        expect(pay).toMatchObject({
            status: "blocked",
            influenced: true,
            startedAt: at(6).getTime(),
            durationMs: 0,
            output: null,
        });
        expect(pay?.context).toMatchObject({ origin: "web:acme-billing.net", trust: "untrusted" });
        expect(pay?.args.map((arg) => [arg.name, arg.value, arg.masked, arg.valueLabel.kind])).toEqual([
            ["iban", "GB33…5555", true, "iban"],
            ["amount", "4950", false, "amount"],
            ["memo", "Invoice 114", false, "text"],
        ]);
        expect(pay?.args[0]?.valueLabel).toMatchObject({ traced: true, generated: false });
        expect(pay?.args[0]?.valueLabel.appearances[0]).toMatchObject({
            label: { origin: "web:acme-billing.net" },
            match: "exact",
        });
    });

    it("turns decisions into guard rows with their outcome, mode and scan", () => {
        const steps = buildSteps(storedRun()).filter((step) => step.kind === "guard_decision");
        const [source, action, limit, approval, pass] = steps;

        expect(source).toMatchObject({
            parentId: T1,
            status: "ok",
            detail: "instructions, invisible text",
            guard: {
                guard: "source",
                outcome: "flag",
                scan: { findings: ["instructions", "invisible_text"], jevScore: null },
            },
        });
        expect(action).toMatchObject({
            id: "e000000000000003",
            status: "blocked",
            guard: { outcome: "block", mode: "block", scan: null },
        });
        expect(limit).toMatchObject({ status: "ok", guard: { mode: "observe" } });
        expect(approval?.guard?.mode).toBeNull();
        expect(pass).toMatchObject({ detail: "pass", guard: { scan: { findings: [] } } });
    });

    it("handles calls with no matching model call, an error, model-generated values and no arguments", () => {
        const run = storedRun();
        run.steps.push(
            { ...run.steps[1]!, stepId: "7".repeat(16), callId: null, at: at(11), detail: { error: "timeout" } },
            {
                ...run.steps[1]!,
                stepId: "8".repeat(16),
                callId: "unknown",
                at: at(12),
                status: "error",
                detail: { arguments: { to: "x" }, keys: "nope" },
            },
        );
        run.steps[4]!.detail = {
            arguments: { iban: "GB33…5555" },
            keys: [`iban:NL91…4300#${"0".repeat(32)}`, "iban:GB33…5555"],
        };
        run.decisions.push({
            ...run.decisions[2]!,
            eventId: "e000000000000009",
            stepId: T2,
            reason: "value_model_generated",
            field: "iban",
        });
        const steps = buildSteps(run);

        expect(steps.find((step) => step.id === "7".repeat(16))).toMatchObject({
            parentId: null,
            detail: "timeout",
            error: "timeout",
            args: [],
        });
        expect(steps.find((step) => step.id === "8".repeat(16))).toMatchObject({
            parentId: null,
            status: "error",
            detail: "to x",
        });
        expect(steps.find((step) => step.id === T2)?.args[0]?.valueLabel).toMatchObject({
            generated: true,
            kind: "iban",
        });
    });

    it("reads a tool call with no stored detail, and puts a model call first when times tie", () => {
        const run = storedRun();
        run.steps.push({
            ...run.steps[1]!,
            stepId: "9".repeat(16),
            callId: null,
            at: at(20),
            durationMs: 0,
            detail: null,
        });
        run.steps.push({ ...run.steps[0]!, stepId: "a".repeat(16), at: at(7), durationMs: 1000, detail: {} });
        run.decisions.push({ ...run.decisions[2]!, eventId: "e00000000000000a", stepId: "b".repeat(16), at: at(6) });
        const steps = buildSteps(run);

        expect(steps.find((step) => step.id === "9".repeat(16))).toMatchObject({ args: [], detail: "", error: null });
        const tied = steps.filter((step) => step.startedAt === at(6).getTime()).map((step) => step.kind);
        expect(tied[0]).toBe("model_call");
    });

    it("ignores usage that is incomplete, and a cost that is not a number", () => {
        const run = storedRun();
        run.steps[0]!.detail = { usage: { inputTokens: 5, outputTokens: 1 }, costUsd: "0.1" };

        expect(buildSteps(run).find((step) => step.id === M1)?.model).toMatchObject({
            inputTokens: 0,
            costUsd: 0,
            costKnown: false,
        });
    });

    it("shows a permission check only when it stopped a call", () => {
        const run = storedRun();
        run.decisions.push({
            ...run.decisions[0]!,
            eventId: "e00000000000000b",
            stepId: T2,
            guard: "permission",
            rule: "permission",
            decision: "block",
            reason: "permission_denied",
            at: at(6),
        });
        const checks = buildSteps(run).filter((step) => step.guard?.guard === "permission");

        expect(checks).toEqual([
            expect.objectContaining({
                status: "blocked",
                detail: "permission denied",
                guard: expect.objectContaining({ mode: "block", scan: null }),
            }),
        ]);
    });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newState, RUN_ID, START } from "../../../../../test/data-runs-build/state";
import { argsHash } from "../../values/hash";
import { APPROVERS } from "../../values/people";
import { askHuman } from "./approval";
import { toStepArg } from "./calls";
import type { ArgFacts } from "../../guards/evaluate";

const IBAN = "GB33BUKB20201555555555";

// A pay_invoice call with its argument facts, as toolCall builds them.
function payCall() {
    const s = newState();
    const call = s.step("billing", "tool_call", "pay_invoice", null, 0);
    const facts: ArgFacts[] = [
        { name: "iban", raw: IBAN, kind: "iban", label: s.trace(IBAN, "iban") },
        { name: "amount", raw: "4950 EUR", kind: "amount", label: s.trace("4950 EUR", "amount") },
    ];
    call.args = facts.map(toStepArg);
    return { s, call, facts };
}

function approvalStep(s: ReturnType<typeof newState>) {
    return s.steps.find((step) => step.kind === "approval")!;
}

describe("askHuman", () => {
    it("approves once by default, after a random wait, by one of the approvers", () => {
        const { s, call, facts } = payCall();
        expect(askHuman(s, "billing", call, facts)).toBe("approved");

        const step = approvalStep(s);
        const hash = argsHash("billing", "pay_invoice", [
            { name: "iban", value: IBAN },
            { name: "amount", value: "4950 EUR" },
        ]);
        expect(step.parentId).toBe(call.id);
        expect(step.name).toBe("pay_invoice");
        expect(step.durationMs % 1000).toBe(0);
        expect(step.durationMs).toBeGreaterThanOrEqual(40_000);
        expect(step.durationMs).toBeLessThanOrEqual(420_000);
        expect(s.clock).toBe(START + step.durationMs);

        const by = step.approval!.by!;
        expect(APPROVERS).toContain(by);
        expect(step.approval).toEqual({
            requestId: expect.stringMatching(/^apr_[0-9a-f]{4}$/),
            state: "approved once",
            by,
            decidedAt: s.clock,
            argsHash: hash,
        });
        expect(step.detail).toBe(`Approved once by ${by}`);
        expect(call.status).toBe("ok");
        expect(s.ending).toBeNull();
        expect(s.approvals).toEqual([
            {
                requestId: step.approval!.requestId,
                runId: RUN_ID,
                stepId: step.id,
                agent: "billing",
                tool: "pay_invoice",
                answer: "approve once",
                by,
                openedAt: START,
                decidedAt: s.clock,
                argsHash: hash,
                args: [
                    { name: "iban", value: call.args[0].value },
                    { name: "amount", value: "4950 EUR" },
                ],
            },
        ]);
        // The stored request shows the masked IBAN, never the raw one.
        expect(s.approvals[0].args[0].value).not.toBe(IBAN);
    });

    it("records an always-approve answer with the given person, id and wait", () => {
        const { s, call, facts } = payCall();
        const plan = { answer: "always approve" as const, by: "dana@acme.com", requestId: "apr_fixed", waitMs: 5000 };
        expect(askHuman(s, "billing", call, facts, plan)).toBe("approved");
        const step = approvalStep(s);
        expect(step.durationMs).toBe(5000);
        expect(step.approval!.state).toBe("always approved");
        expect(step.approval!.requestId).toBe("apr_fixed");
        expect(step.detail).toBe("Always approved by dana@acme.com");
        expect(s.approvals[0].answer).toBe("always approve");
    });

    it("blocks the call when the person denies it", () => {
        const { s, call, facts } = payCall();
        expect(askHuman(s, "billing", call, facts, { answer: "deny", by: "marco@acme.com", waitMs: 1000 })).toBe(
            "denied",
        );
        const step = approvalStep(s);
        expect(step.status).toBe("blocked");
        expect(step.approval!.state).toBe("denied");
        expect(step.detail).toBe("Denied by marco@acme.com");
        expect(call.status).toBe("blocked");
        // A denial blocks the call but does not end the run.
        expect(s.ending).toBeNull();
        expect(s.approvals.map((a) => a.answer)).toEqual(["deny"]);
    });

    it("leaves the run waiting at the end of the data when nobody has answered", () => {
        const { s, call, facts } = payCall();
        expect(askHuman(s, "billing", call, facts, { answer: "waiting" })).toBe("waiting");
        const step = approvalStep(s);
        expect(step.status).toBe("waiting");
        expect(step.detail).toBe("Waiting for a human");
        expect(step.approval).toMatchObject({ state: "waiting", by: null, decidedAt: null });
        expect(call.status).toBe("waiting");
        expect(s.ending).toBe("waiting");
        expect(s.clock).toBe(START);
        expect(s.approvals).toEqual([]);
    });

    it("fails the run when the host stops the waiting process, keeping the request open", () => {
        const { s, call, facts } = payCall();
        expect(askHuman(s, "billing", call, facts, { answer: "stopped", waitMs: 60_000 })).toBe("stopped");
        const step = approvalStep(s);
        expect(step.status).toBe("error");
        expect(step.approval!.state).toBe("no longer waiting");
        expect(step.detail).toBe("No longer waiting: the host stopped the waiting process. The request stays open");
        expect(call.status).toBe("error");
        expect(call.error).toBe("The host stopped the process while it waited for approval");
        expect(s.ending).toBe("failed");
        expect(s.clock).toBe(START + 60_000);
        expect(s.approvals).toEqual([]);
    });
});

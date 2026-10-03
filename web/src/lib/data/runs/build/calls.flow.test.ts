// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newState, START } from "../../../../../test/data-runs-build/state";
import { labelFor, USER_LABEL } from "../../labels/origins";
import { modelCall, toolCall } from "./calls";

const IBAN = "GB33BUKB20201555555555";
const PAGE = labelFor("web:supplier-portal.example");

function decisions(s: ReturnType<typeof newState>) {
    return s.steps.filter((step) => step.kind === "guard_decision");
}

describe("toolCall arguments and parents", () => {
    it("hangs the call under the agent's last model call and marks it", () => {
        const s = newState();
        const model = modelCall(s, "support");
        const { step } = toolCall(s, "support", "summarize", { args: { text: "notes" }, mark: "damage" });
        expect(step.parentId).toBe(model.id);
        expect(s.marks).toEqual([{ role: "damage", stepId: step.id }]);
    });

    it("uses a given parent, including none", () => {
        const s = newState();
        modelCall(s, "support");
        expect(toolCall(s, "support", "summarize", { args: {}, parentId: "p" }).step.parentId).toBe("p");
        expect(toolCall(s, "support", "summarize", { args: {}, parentId: null }).step.parentId).toBeNull();
    });

    it("keeps raw arguments with the label of their first appearance, else the call's context", () => {
        const s = newState();
        s.see("billing", [USER_LABEL]);
        s.remember([{ value: "https://supplier-portal.example/pay" }], PAGE, "page-step", "billing");
        const { step } = toolCall(s, "billing", "summarize", {
            args: { url: "https://supplier-portal.example/pay", note: "INV-20931" },
            kinds: { note: "text" },
        });
        expect(step.args.map((arg) => [arg.name, arg.valueLabel.kind])).toEqual([
            ["url", "url"],
            ["note", "text"],
        ]);
        expect(s.rawArgs).toEqual([
            {
                stepId: step.id,
                agent: "billing",
                tool: "summarize",
                name: "url",
                raw: "https://supplier-portal.example/pay",
                kind: "url",
                label: PAGE,
                at: START,
            },
            {
                stepId: step.id,
                agent: "billing",
                tool: "summarize",
                name: "note",
                raw: "INV-20931",
                kind: "text",
                label: USER_LABEL,
                at: START,
            },
        ]);
    });

    it("counts calls of a tool across the run for per-run limits", () => {
        const s = newState();
        toolCall(s, "billing", "send_email", { args: { to: "ops@acme.com" } });
        toolCall(s, "billing", "send_email", { args: { to: "ops@acme.com" } });
        const perRun = decisions(s).filter((d) => d.name === "send_email.per-run");
        expect(perRun.map((d) => d.detail)).toEqual(["Email 1 of 20 in this run", "Email 2 of 20 in this run"]);
    });
});

describe("toolCall checks", () => {
    it("stops a call a rule blocks before it runs", () => {
        const s = newState();
        const sent = toolCall(s, "billing", "send_email", {
            args: { to: "ops@acme.com" },
            fleet: { known: false, runs: 2, quarantined: true },
            output: { summary: "sent" },
        });
        expect(sent.result).toBe("blocked");
        expect(sent.step.status).toBe("blocked");
        expect(sent.step.output).toBeNull();
        expect(sent.step.durationMs).toBe(s.steps.at(-1)!.startedAt + s.steps.at(-1)!.durationMs - START);
    });

    it("passes run links to the limit check", () => {
        const s = newState();
        const links = { depth: 1, fanOut: 1, loops: 5, pair: "a and b" };
        expect(toolCall(s, "a", "delegate", { args: { to: "b" }, links }).result).toBe("blocked");
    });

    it("lets a script force a decision", () => {
        const s = newState();
        const sent = toolCall(s, "support", "label_thread", {
            args: { thread: "T-1" },
            decide: { label_thread: { outcome: "block", reason: "Forced" } },
        });
        expect(sent.result).toBe("blocked");
        expect(decisions(s)[0].detail).toBe("Forced");
    });

    it("skips asking a human when an always-approve grant matches", () => {
        const s = newState();
        const sent = toolCall(s, "support", "refund_order", { args: { order: "ORD-55120" }, grant: "gr_12" });
        expect(sent.result).toBe("ran");
        expect(s.steps.some((step) => step.kind === "approval")).toBe(false);
        expect(decisions(s)[0].detail).toBe("Matched always-approve grant gr_12");
    });

    it("waits without finishing the call when nobody has answered", () => {
        const s = newState();
        const sent = toolCall(s, "support", "refund_order", {
            args: { order: "ORD-55120" },
            approval: { answer: "waiting" },
        });
        expect(sent.result).toBe("waiting");
        expect(sent.step.status).toBe("waiting");
        expect(sent.step.durationMs).toBe(0);
    });

    it.each([
        ["deny", "denied", "blocked"],
        ["stopped", "stopped", "error"],
    ] as const)("ends the call when the human answer is %s", (answer, result, status) => {
        const s = newState();
        const sent = toolCall(s, "support", "refund_order", {
            args: { order: "ORD-55120" },
            approval: { answer, waitMs: 2000 },
            output: { summary: "refunded" },
        });
        expect(sent.result).toBe(result);
        expect(sent.step.status).toBe(status);
        expect(sent.step.output).toBeNull();
        expect(sent.step.durationMs).toBeGreaterThan(2000);
    });

    it("runs the call once the human approves", () => {
        const s = newState();
        const sent = toolCall(s, "support", "refund_order", {
            args: { order: "ORD-55120" },
            approval: { answer: "approve once", by: "dana@acme.com", waitMs: 2000 },
            durationMs: 500,
        });
        expect(sent.result).toBe("ran");
        expect(sent.step.status).toBe("ok");
        expect(s.approvals).toHaveLength(1);
    });
});

describe("toolCall running", () => {
    it("takes the given duration for the tool itself", () => {
        const s = newState();
        const { step } = toolCall(s, "support", "summarize", { args: {}, durationMs: 777 });
        expect(step.durationMs).toBe(777);
        expect(step.status).toBe("ok");
    });

    it("draws a duration in the tool's usual range", () => {
        const s = newState();
        const { step } = toolCall(s, "support", "label_thread", { args: { thread: "T-1" } });
        const checks = decisions(s)[0];
        const ran = step.startedAt + step.durationMs - (checks.startedAt + checks.durationMs);
        expect(ran).toBeGreaterThanOrEqual(60);
        expect(ran).toBeLessThanOrEqual(220);
    });

    it("draws between 100 and 900 ms for a tool with no usual range", () => {
        const s = newState();
        const { step } = toolCall(s, "support", "translate", { args: {} });
        expect(step.durationMs).toBeGreaterThanOrEqual(100);
        expect(step.durationMs).toBeLessThanOrEqual(900);
    });

    it("records a tool error and leaves the output empty", () => {
        const s = newState();
        const sent = toolCall(s, "support", "summarize", {
            args: {},
            error: "Timed out",
            output: { summary: "never" },
        });
        expect(sent.result).toBe("error");
        expect(sent.step).toMatchObject({ status: "error", error: "Timed out", output: null });
    });

    it("adds a paid invoice to today's total, which the daily cap then counts", () => {
        const s = newState();
        const plan = { answer: "approve once" as const, by: "dana@acme.com", waitMs: 1000 };
        toolCall(s, "billing", "pay_invoice", { args: { iban: IBAN, amount: "30,000 EUR" }, approval: plan });
        expect(s.paidTodayEur).toBe(30_000);
        const second = toolCall(s, "billing", "pay_invoice", {
            args: { iban: IBAN, amount: "30,000 EUR" },
            approval: plan,
        });
        expect(second.result).toBe("blocked");
        expect(s.paidTodayEur).toBe(30_000);
        const caps = decisions(s).filter((d) => d.name === "pay_invoice.daily-cap");
        expect(caps.map((d) => d.detail)).toEqual([
            "30,000 of 50,000 EUR today",
            "Would reach 60,000 of 50,000 EUR today",
        ]);
    });
});

describe("toolCall output", () => {
    it("labels the output, masks its summary, indexes its values and lets the agent read it", () => {
        const s = newState();
        const { step, result } = toolCall(s, "billing", "fetch_page", {
            args: { url: "https://supplier-portal.example/pay" },
            output: { summary: `Pay to ${IBAN}`, values: [{ value: IBAN, kind: "iban" }] },
        });
        expect(result).toBe("ran");
        expect(step.output!.label).toEqual(PAGE);
        expect(step.output!.summary).not.toContain(IBAN);
        expect(s.index.map((v) => [v.raw, v.stepId])).toEqual([[IBAN, step.id]]);
        expect(s.readBy("billing")).toEqual([PAGE]);
        expect(s.trace(IBAN).appearances[0].label).toEqual(PAGE);
    });

    it("uses a given origin and copes with an output without values", () => {
        const s = newState();
        const { step } = toolCall(s, "billing", "summarize", {
            args: {},
            output: { summary: "ok", origin: "tool:summarize" },
        });
        expect(step.output!.label.origin).toBe("tool:summarize");
        expect(s.index).toEqual([]);
        expect(s.readBy("billing")).toEqual([labelFor("tool:summarize")]);
    });

    it("blocks a page from a blocked domain after it returns, so the agent never reads it", () => {
        const s = newState();
        const sent = toolCall(s, "billing", "fetch_page", {
            args: { url: "https://pay-update.example/x" },
            output: { summary: "page", values: [{ value: IBAN }] },
        });
        expect(sent.result).toBe("blocked");
        expect(sent.step.status).toBe("blocked");
        expect(sent.step.output!.label.origin).toBe("web:pay-update.example");
        expect(s.index).toEqual([]);
        expect(s.readBy("billing")).toEqual([]);
    });
});

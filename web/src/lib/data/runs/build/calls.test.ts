// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newState, START } from "../../../../../test/data-runs-build/state";
import { maskText, maskValue } from "../../../mask";
import { costOf } from "../../agents/prices";
import { labelFor, USER_LABEL } from "../../labels/origins";
import { modelCall, toolCall, toStepArg } from "./calls";
import type { BuildState } from "./state";

const IBAN = "GB33BUKB20201555555555";

describe("toStepArg", () => {
    it("masks a sensitive value and says it was masked", () => {
        const s = newState();
        const arg = toStepArg({ name: "iban", raw: IBAN, kind: "iban", label: s.trace(IBAN) });
        expect(arg.name).toBe("iban");
        expect(arg.value).toBe(maskValue(IBAN));
        expect(arg.value).not.toBe(IBAN);
        expect(arg.masked).toBe(true);
        expect(arg.valueLabel.kind).toBe("iban");
    });

    it("masks values inside free text and leaves plain text alone", () => {
        const s = newState();
        const note = `Pay ${IBAN} today`;
        const masked = toStepArg({ name: "memo", raw: note, kind: "text", label: s.trace(note) });
        expect(masked.masked).toBe(true);
        expect(masked.value).toBe(maskText(note));
        expect(masked.value).not.toContain(IBAN);
        const plain = toStepArg({ name: "memo", raw: "Invoice 114", kind: "text", label: s.trace("Invoice 114") });
        expect(plain).toMatchObject({ value: "Invoice 114", masked: false });
    });
});

describe("modelCall", () => {
    it("writes a model call with drawn tokens, cost and duration when nothing is given", () => {
        const s = newState();
        const step = modelCall(s, "billing");
        const usage = step.model!;
        expect(step).toMatchObject({ kind: "model_call", name: "gpt-6.1", parentId: null, startedAt: START });
        expect(step.detail).toBe("Answered");
        expect(usage.toolCalls).toEqual([]);
        expect(usage.inputTokens).toBeGreaterThanOrEqual(1800);
        expect(usage.inputTokens).toBeLessThanOrEqual(9800);
        expect(usage.outputTokens).toBeGreaterThanOrEqual(60);
        expect(usage.outputTokens).toBeLessThanOrEqual(640);
        expect(usage.cachedTokens).toBeGreaterThanOrEqual(Math.round(usage.inputTokens * 0.1));
        expect(usage.cachedTokens).toBeLessThanOrEqual(Math.round(usage.inputTokens * 0.6));
        expect(usage.costUsd).toBe(costOf("gpt-6.1", usage.inputTokens, usage.cachedTokens, usage.outputTokens));
        expect(step.durationMs).toBeGreaterThanOrEqual(500 + usage.outputTokens * 9);
        expect(step.durationMs).toBeLessThanOrEqual(500 + usage.outputTokens * 16);
        expect(s.lastModel.get("billing")).toBe(step.id);
        // A short gap follows the call before the next step.
        expect(s.clock - (START + step.durationMs)).toBeGreaterThanOrEqual(15);
        expect(s.clock - (START + step.durationMs)).toBeLessThanOrEqual(120);
        expect(s.readBy("billing")).toEqual([]);
    });

    it("uses given tokens and duration, lists the tools asked for and hangs under the session", () => {
        const s = newState();
        s.session.set("billing", "handoff-step");
        const step = modelCall(s, "billing", {
            tokens: [2000, 100],
            durationMs: 1500,
            calls: ["lookup_supplier", "pay_invoice"],
        });
        expect(step.parentId).toBe("handoff-step");
        expect(step.durationMs).toBe(1500);
        expect(step.model).toMatchObject({
            inputTokens: 2000,
            outputTokens: 100,
            toolCalls: ["lookup_supplier", "pay_invoice"],
        });
        expect(step.detail).toBe("Asked for lookup_supplier, pay_invoice");
    });

    it("prefers a given detail, records an error and marks the step", () => {
        const s = newState();
        const step = modelCall(s, "billing", {
            detail: "Refused",
            calls: ["pay_invoice"],
            error: "Rate limited",
            mark: "turning",
        });
        expect(step.detail).toBe("Refused");
        expect(step.status).toBe("error");
        expect(step.error).toBe("Rate limited");
        expect(s.marks).toEqual([{ role: "turning", stepId: step.id }]);
    });

    it("reads the user's message with the user label and indexes its values", () => {
        const s = newState();
        const step = modelCall(s, "billing", { input: { text: "Pay INV-20931", values: [{ value: "INV-20931" }] } });
        expect(s.readBy("billing")).toEqual([USER_LABEL]);
        expect(step.context).toEqual(USER_LABEL);
        expect(s.index).toHaveLength(1);
        expect(s.index[0]).toMatchObject({ raw: "INV-20931", label: USER_LABEL, stepId: step.id, at: START });
    });

    it("labels an input with a given label and copes with an input without values", () => {
        const s = newState();
        const mail = labelFor("email:supplier-portal.example");
        const step = modelCall(s, "billing", { input: { text: "Hello", label: mail } });
        expect(step.influenced).toBe(true);
        expect(s.readBy("billing")).toEqual([mail]);
        expect(s.index).toEqual([]);
    });
});

function search(s: BuildState) {
    const model = modelCall(s, "researcher", {
        durationMs: 1000,
        search: { query: "acme invoice portal", sources: ["https://a.example/x", "https://b.example/y"] },
        searchMark: "entry",
    });
    const call = s.steps.find((step) => step.name === "web_search")!;
    return { model, call };
}

describe("modelCall with hosted search", () => {
    it("runs the search inside the model call as a hosted tool call", () => {
        const s = newState();
        const { model, call } = search(s);
        expect(call.parentId).toBe(model.id);
        expect(call.hosted).toBe(true);
        expect(call.startedAt).toBe(START + 200);
        // The search itself takes 45% of the model call.
        expect(call.durationMs).toBeGreaterThanOrEqual(450);
        expect(call.startedAt + call.durationMs).toBeLessThanOrEqual(START + 1000);
        expect(call.detail).toBe("2 sources · unscanned");
        expect(call.output).toEqual({
            label: labelFor("search:hosted"),
            summary: "2 sources consulted. Page text never reached Quard",
        });
        expect(call.args.map((arg) => [arg.name, arg.value])).toEqual([["query", "acme invoice portal"]]);
        expect(s.marks).toEqual([{ role: "entry", stepId: call.id }]);
    });

    it("indexes the source URLs and makes the model call influenced", () => {
        const s = newState();
        const { model, call } = search(s);
        expect(model.influenced).toBe(true);
        expect(s.readBy("researcher")).toEqual([labelFor("search:hosted")]);
        expect(s.index.map((v) => [v.raw, v.kind, v.stepId])).toEqual([
            ["https://a.example/x", "url", call.id],
            ["https://b.example/y", "url", call.id],
        ]);
        const scan = s.steps.find((step) => step.kind === "guard_decision")!;
        expect(scan.guard!.scan).toEqual({ scanned: false, findings: [], jevScore: null });
        // The clock returns to the end of the model call, then waits a short gap.
        expect(s.clock).toBeGreaterThanOrEqual(START + 1015);
        expect(s.clock).toBeLessThanOrEqual(START + 1120);
    });
});

// The call step a tool call writes, with its output, for checking defaults.
function run(name: string, args: Record<string, string>) {
    const s = newState();
    const { step } = toolCall(s, "support", name, {
        args,
        output: { summary: "done" },
        approval: { answer: "approve once", by: "dana@acme.com", waitMs: 1000 },
    });
    return step;
}

describe("toolCall default details", () => {
    it.each([
        ["fetch_page", { url: "https://docs.python.org/3/" }, "GET docs.python.org/3/"],
        ["fetch_page", {}, "GET "],
        ["pay_invoice", { amount: "100 EUR", iban: IBAN }, `100 EUR to ${maskValue(IBAN)}`],
        ["pay_invoice", {}, " to "],
        ["send_email", { to: "ops@acme.com" }, `To ${maskValue("ops@acme.com")}`],
        ["send_email", {}, "To "],
        ["delegate", { to: "researcher" }, "To researcher"],
        ["delegate", {}, "To "],
        ["read_inbox", { mailbox: "billing" }, "Unread mail in billing"],
        ["read_inbox", {}, "Unread mail in the inbox"],
        ["summarize", { text: "Short note" }, "Short note"],
        ["summarize", {}, ""],
    ])("describes %s with %j as %j", (name, args, detail) => {
        expect(run(name, args as Record<string, string>).detail).toBe(detail);
    });

    it("never shows a raw IBAN or email address in the detail", () => {
        expect(run("pay_invoice", { amount: "100 EUR", iban: IBAN }).detail).not.toContain(IBAN);
        expect(run("send_email", { to: "ops@acme.com" }).detail).not.toContain("ops@acme.com");
    });

    it("cuts a long first argument at 64 characters", () => {
        const step = run("summarize", { text: "x".repeat(70) });
        expect(step.detail).toBe(`${"x".repeat(63)}…`);
    });
});

describe("toolCall default origins", () => {
    it.each([
        ["fetch_page", { url: "https://docs.python.org/3/" }, "web:docs.python.org"],
        ["fetch_page", {}, "web:unknown"],
        ["web_search", { query: "q" }, "search:hosted"],
        ["search_docs", { query: "refunds" }, "mcp:docs.acme.internal"],
        ["crm_lookup", { customer: "C-1" }, "mcp:crm.acme.internal"],
        ["get_invoice_pdf", { path: "/srv/invoices/INV-1.pdf" }, "file:/srv/invoices/INV-1.pdf"],
        ["get_invoice_pdf", {}, "file:unknown"],
        ["receive_message", { from: "billing" }, "agent:billing"],
        ["receive_message", {}, "agent:unknown"],
        ["lookup_supplier", { supplier_id: "SUP-00412" }, "tool:lookup_supplier"],
        ["summarize", { text: "t" }, "unknown:summarize"],
    ])("labels output of %s with %j as %s", (name, args, origin) => {
        expect(run(name, args as Record<string, string>).output!.label.origin).toBe(origin);
    });
});

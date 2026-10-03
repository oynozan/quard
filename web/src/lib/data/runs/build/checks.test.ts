// @vitest-environment node
import { describe, expect, it } from "vitest";
import { newState, START } from "../../../../../test/data-runs-build/state";
import { MINUTE } from "../../rng";
import { BACKEND_OUTAGE, OUTAGE_REASON } from "../../guards/outage";
import { toolSpec } from "../../guards/tools";
import { labelFor } from "../../labels/origins";
import { runChecks, runSourceCheck, type Overrides } from "./checks";
import type { CallFacts } from "../../guards/evaluate";
import type { BuildState } from "./state";

const IBAN = "GB33BUKB20201555555555";

function facts(s: BuildState, tool: string, args: Record<string, string>, more: Partial<CallFacts> = {}): CallFacts {
    return {
        tool,
        agent: "billing",
        args: Object.entries(args).map(([name, raw]) => ({ name, raw, kind: "text", label: s.trace(raw) })),
        context: s.context("billing"),
        callsInRun: 1,
        links: { depth: 0, fanOut: 0, loops: 0, pair: "" },
        fleet: { known: true, runs: 1, quarantined: false },
        grant: null,
        paidTodayEur: 0,
        ...more,
    };
}

function check(tool: string, args: Record<string, string>, more: Partial<CallFacts> = {}, overrides: Overrides = {}) {
    return checkAt(START, tool, args, more, overrides);
}

function checkAt(
    at: number,
    tool: string,
    args: Record<string, string>,
    more: Partial<CallFacts> = {},
    overrides: Overrides = {},
) {
    const s = newState(at);
    const call = s.step("billing", "tool_call", tool, null, 0);
    const result = runChecks(s, "billing", call, toolSpec(tool), facts(s, tool, args, more), overrides);
    const decisions = s.steps.filter((step) => step.kind === "guard_decision");
    return { s, call, result, decisions };
}

describe("runChecks", () => {
    it("allows a delegation inside the run limits and records the observe-mode rule", () => {
        const { result, decisions, call } = check("delegate", { to: "researcher" });
        expect(result).toBe("allow");
        expect(decisions).toHaveLength(1);
        expect(decisions[0].parentId).toBe(call.id);
        expect(decisions[0].status).toBe("ok");
        expect(decisions[0].detail).toBe("Depth 0 of 3 · fan-out 0 of 10");
        expect(decisions[0].guard).toMatchObject({
            guard: "limit",
            tool: "delegate",
            outcome: "allow",
            mode: "observe",
            rule: "run-limits",
            ruleHash: "5c0e9a7b31d4",
            degraded: false,
            scan: null,
        });
    });

    it("blocks a delegation loop with the loop limit's own rule and hash", () => {
        const links = { depth: 1, fanOut: 1, loops: 5, pair: "billing and researcher" };
        const { result, decisions } = check("delegate", { to: "researcher" }, { links });
        expect(result).toBe("block");
        expect(decisions[0].status).toBe("blocked");
        expect(decisions[0].guard).toMatchObject({
            rule: "run-limits.loops",
            ruleHash: "d17a4c2e8b90",
            mode: "block",
            reason: "Loop: 5 handoffs back and forth, billing and researcher",
        });
    });

    it("runs a payment's rules in pipeline order and keeps a block over a later ask", () => {
        const { result, decisions } = check("pay_invoice", { iban: IBAN, amount: "60000 EUR" });
        expect(decisions.map((d) => d.name)).toEqual([
            "pay_invoice.daily-cap",
            "fleet-check",
            "pay_invoice.iban-source",
            "pay_invoice",
        ]);
        expect(decisions.map((d) => [d.guard!.outcome, d.status])).toEqual([
            ["block", "blocked"],
            ["allow", "ok"],
            // Observe mode records "would block" but leaves the step alone.
            ["block", "ok"],
            ["ask", "ok"],
        ]);
        expect(result).toBe("block");
    });

    it("asks a human when only the approval rule holds the call back", () => {
        const { result, decisions } = check("pay_invoice", { iban: IBAN, amount: "100 EUR" });
        expect(result).toBe("ask");
        expect(decisions.at(-1)!.guard).toMatchObject({ outcome: "ask", mode: null });
    });

    it("lets a script force a decision by the rule's name or by the guard's name", () => {
        const links = { depth: 1, fanOut: 1, loops: 6, pair: "a and b" };
        const loop = check("delegate", { to: "b" }, { links }, { "run-limits.loops": { outcome: "allow" } });
        expect(loop.result).toBe("allow");
        expect(loop.decisions[0].guard!.reason).toBe("Loop: 6 handoffs back and forth, a and b");

        const pay = check(
            "pay_invoice",
            { iban: IBAN, amount: "100 EUR" },
            {},
            { pay_invoice: { outcome: "allow", reason: "Approved in advance", mode: "block", degraded: true } },
        );
        expect(pay.result).toBe("allow");
        expect(pay.decisions.at(-1)!.guard).toMatchObject({
            outcome: "allow",
            reason: "Approved in advance",
            mode: "block",
            degraded: true,
        });
    });

    it("can force a rule to have no mode at all", () => {
        const { result, decisions } = check(
            "lookup_supplier",
            { supplier_id: "SUP-00412" },
            {},
            { lookup_supplier: { mode: null, outcome: "block" } },
        );
        expect(decisions[0].guard!.mode).toBeNull();
        expect(decisions[0].status).toBe("blocked");
        expect(result).toBe("block");
    });

    it("turns an ask into a block after 30 s while the backend is down", () => {
        const at = BACKEND_OUTAGE.from + MINUTE;
        const { s, result, decisions } = checkAt(at, "refund_order", { order: "ORD-55120" });
        expect(result).toBe("block");
        expect(decisions[0].guard).toMatchObject({ outcome: "block", reason: OUTAGE_REASON, degraded: true });
        expect(decisions[0].startedAt).toBeGreaterThanOrEqual(at + 30_000);
        expect(s.clock).toBeGreaterThan(at + 30_000);
    });

    it("keeps an observe-mode ask as an ask during the outage and lets the call through", () => {
        const at = BACKEND_OUTAGE.from + MINUTE;
        const { result, decisions } = checkAt(
            at,
            "refund_order",
            { order: "ORD-55120" },
            {},
            { refund_order: { mode: "observe" } },
        );
        expect(result).toBe("allow");
        expect(decisions[0].guard).toMatchObject({ outcome: "ask", mode: "observe" });
        expect(decisions[0].startedAt).toBeLessThan(at + 30_000);
    });
});

function scan(tool: string, origin: string, overrides: Overrides = {}) {
    const s = newState();
    const call = s.step("support", "tool_call", tool, null, 0);
    const result = runSourceCheck(s, "support", call, toolSpec(tool), origin, overrides);
    const decision = s.steps.find((step) => step.kind === "guard_decision");
    return { s, call, result, decision };
}

describe("runSourceCheck", () => {
    it("does nothing for a tool without a source rule", () => {
        const { s, result, decision } = scan("pay_invoice", "tool:pay_invoice");
        expect(result).toBeNull();
        expect(decision).toBeUndefined();
        expect(s.clock).toBe(START);
    });

    it("labels and scans a public web page and gives it a Jev score", () => {
        const { result, decision, call } = scan("fetch_page", "web:docs.python.org");
        expect(result).toBe("pass");
        expect(decision!.parentId).toBe(call.id);
        expect(decision!.detail).toBe("Labeled web:docs.python.org. Nothing suspect found");
        const found = decision!.guard!.scan!;
        expect(found.scanned).toBe(true);
        expect(found.findings).toEqual([]);
        expect(found.jevScore).toBeGreaterThanOrEqual(0.01);
        expect(found.jevScore).toBeLessThanOrEqual(0.16);
        expect(Math.round(found.jevScore! * 100) / 100).toBe(found.jevScore);
    });

    it("blocks a page from a listed domain", () => {
        const { result, decision } = scan("fetch_page", "web:login.pay-update.example");
        expect(result).toBe("block");
        expect(decision!.status).toBe("blocked");
        expect(decision!.guard!.reason).toBe("login.pay-update.example is on the block list");
    });

    it("reports pass in observe mode and uses the script's findings and Jev score", () => {
        const { result, decision } = scan("fetch_page", "web:pay-update.example", {
            fetch_page: { mode: "observe", findings: ["instructions"], jev: 0.91 },
        });
        expect(result).toBe("pass");
        expect(decision!.status).toBe("ok");
        expect(decision!.guard).toMatchObject({ outcome: "block", mode: "observe" });
        expect(decision!.guard!.scan).toEqual({ scanned: true, findings: ["instructions"], jevScore: 0.91 });
    });

    it("never scans hosted search pages, so they have no Jev score", () => {
        const { decision } = scan("web_search", "search:hosted");
        expect(decision!.guard!.scan).toEqual({ scanned: false, findings: [], jevScore: null });
        expect(decision!.detail).toBe(
            "Consulted domains are allowed. Page text never reached Quard, so it was not scanned",
        );
    });

    it("gives internal content no Jev score", () => {
        expect(labelFor("mcp:crm.acme.internal").sensitivity).toBe("internal");
        const { decision } = scan("crm_lookup", "mcp:crm.acme.internal");
        expect(decision!.guard!.scan).toEqual({ scanned: true, findings: [], jevScore: null });
    });
});

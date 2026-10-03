// @vitest-environment node
import { describe, expect, it } from "vitest";
import { arg, check, IBAN, label } from "../../../../test/data-guards-incidents/call-facts";
import { amountOf, placeOf, type CallFacts } from "./evaluate";

describe("placeOf", () => {
    it("names the place and keeps the detail after the colon", () => {
        expect(placeOf("web:supplier-portal.example")).toBe("web content (supplier-portal.example)");
        expect(placeOf("email:claims-desk.io")).toBe("outside email (claims-desk.io)");
    });

    it("names only the place when there is no detail", () => {
        expect(placeOf("user")).toBe("the user's message");
        expect(placeOf("web:")).toBe("web content");
        expect(placeOf("carrier-pigeon")).toBe("unlabeled content");
    });
});

describe("amountOf", () => {
    it("reads the number out of an amount", () => {
        expect(amountOf("4,950.00 EUR")).toBe(4950);
    });

    it("gives 0 for a missing or unreadable amount", () => {
        expect(amountOf(undefined)).toBe(0);
        expect(amountOf("")).toBe(0);
        expect(amountOf("EUR")).toBe(0);
        expect(amountOf("1.2.3")).toBe(0);
    });
});

describe("run limits", () => {
    const links = (fields: Partial<CallFacts["links"]>) => ({
        links: { depth: 2, fanOut: 3, loops: 0, pair: "inbox-triage and support", ...fields },
    });

    it("blocks a loop with the loop rule, which the team set to block", () => {
        expect(check("run-limits", links({ loops: 5 }))).toEqual({
            outcome: "block",
            reason: "Loop: 5 handoffs back and forth, inbox-triage and support",
            rule: "run-limits.loops",
            mode: "block",
        });
    });

    it("blocks too deep and too wide runs with their own rules, in observe mode", () => {
        expect(check("run-limits", links({ depth: 4 }))).toEqual({
            outcome: "block",
            reason: "Depth 4 of 3",
            rule: "run-limits.depth",
            mode: "observe",
        });
        expect(check("run-limits", links({ fanOut: 11 }))).toEqual({
            outcome: "block",
            reason: "Fan-out 11 of 10",
            rule: "run-limits.fan-out",
            mode: "observe",
        });
    });

    it("allows a run inside every limit and says how close it is", () => {
        expect(check("run-limits", links({ depth: 3, fanOut: 10, loops: 4 }))).toEqual({
            outcome: "allow",
            reason: "Depth 3 of 3 · fan-out 10 of 10",
            rule: "run-limits",
            mode: "observe",
        });
    });
});

describe("fleet check", () => {
    const iban = { args: [arg("iban", IBAN, "iban")] };

    it("blocks a quarantined value and shows it masked", () => {
        const verdict = check("fleet-check", { ...iban, fleet: { known: false, runs: 1, quarantined: true } });
        expect(verdict).toEqual({
            outcome: "block",
            reason: "DE89…3000 is on the quarantine list",
            rule: "fleet-check",
            mode: "block",
        });
    });

    it("allows a value the fleet already knows", () => {
        expect(check("fleet-check", iban).reason).toBe("DE89…3000 is known to the fleet");
    });

    it("blocks a new value on its 5th run within 24 hours", () => {
        const verdict = check("fleet-check", { ...iban, fleet: { known: false, runs: 5, quarantined: false } });
        expect(verdict.outcome).toBe("block");
        expect(verdict.reason).toBe("DE89…3000 reached a 5th run within 24 hours of first being seen");
    });

    it("allows a new value before its 5th run and counts the runs", () => {
        const verdict = check("fleet-check", { ...iban, fleet: { known: false, runs: 4, quarantined: false } });
        expect(verdict.outcome).toBe("allow");
        expect(verdict.reason).toBe("DE89…3000 is new to the fleet: 4 of 5 runs in 24 hours");
    });

    it("watches the recipient when there is no IBAN", () => {
        const verdict = check("fleet-check", { args: [arg("to", "refunds@claims-desk.io", "email")] });
        expect(verdict.reason).toBe("r…@claims-desk.io is known to the fleet");
    });

    it("says 'The value' when the call has nothing to watch", () => {
        expect(check("fleet-check").reason).toBe("The value is known to the fleet");
    });
});

describe("IBAN source rule", () => {
    it("allows a call without an IBAN", () => {
        expect(check("pay_invoice.iban-source")).toEqual({
            outcome: "allow",
            reason: "No IBAN in this call",
            rule: "pay_invoice.iban-source",
            mode: "observe",
        });
    });

    it("allows an IBAN that also appears in supplier records", () => {
        const origins = [label("web:supplier-portal.example"), label("tool:lookup_supplier", "trusted")];
        const verdict = check("pay_invoice.iban-source", { args: [arg("iban", IBAN, "iban", origins)] });
        expect(verdict.outcome).toBe("allow");
        expect(verdict.reason).toBe("The IBAN comes from supplier records");
    });

    it("blocks a model-generated IBAN", () => {
        const verdict = check("pay_invoice.iban-source", { args: [arg("iban", IBAN, "iban", [], true)] });
        expect(verdict.outcome).toBe("block");
        expect(verdict.reason).toBe("The IBAN was model-generated, not taken from supplier records");
    });

    it("blocks an IBAN first seen somewhere else and names that place", () => {
        const origins = [label("web:supplier-portal.example"), label("email:claims-desk.io")];
        const verdict = check("pay_invoice.iban-source", { args: [arg("iban", IBAN, "iban", origins)] });
        expect(verdict.outcome).toBe("block");
        expect(verdict.reason).toBe(
            "The IBAN first appeared in web content (supplier-portal.example), not in supplier records",
        );
    });

    it("blocks an IBAN that appears nowhere instead of crashing", () => {
        for (const kind of ["text", "amount"] as const) {
            const verdict = check("pay_invoice.iban-source", { args: [arg("iban", "nothing", kind)] });
            expect(verdict.outcome).toBe("block");
            expect(verdict.reason).toBe("The IBAN does not appear in supplier records");
        }
    });
});

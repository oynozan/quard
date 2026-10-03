// @vitest-environment node
import { describe, expect, it } from "vitest";
import { arg, check, label, specOf } from "../../../../test/data-guards-incidents/call-facts";
import { evaluateSource } from "./evaluate";
import type { Label } from "../types";

describe("email egress rule", () => {
    const to = (raw: string, origins: Label[] = []) => ({ args: [arg("to", raw, "email", origins)] });

    it("allows an email without a recipient", () => {
        expect(check("send_email").reason).toBe("No recipient");
    });

    it("allows a recipient on an allowlisted domain, subdomains included", () => {
        const verdict = check("send_email", to("ap@mail.northwind-parts.example"));
        expect(verdict).toEqual({
            outcome: "allow",
            reason: "Recipient domain northwind-parts.example is on the allowlist",
            rule: "send_email",
            mode: "block",
        });
    });

    it("allows a recipient on file in a trusted place", () => {
        const origins = [label("email:claims-desk.io"), label("mcp:crm.acme.internal", "trusted")];
        const verdict = check("send_email", to("refunds@claims-desk.io", origins));
        expect(verdict.outcome).toBe("allow");
        expect(verdict.reason).toBe("Recipient is on file in mcp:crm.acme.internal");
    });

    it("asks before writing to a never-seen recipient", () => {
        const verdict = check("send_email", to("refunds@claims-desk.io"));
        expect(verdict.outcome).toBe("ask");
        expect(verdict.reason).toBe("Never-seen recipient");
    });

    it("blocks internal data headed to an address from outside content", () => {
        const verdict = check("send_email", {
            ...to("refunds@claims-desk.io", [label("email:claims-desk.io")]),
            context: label("mcp:crm.acme.internal", "trusted", "internal"),
        });
        expect(verdict.outcome).toBe("block");
        expect(verdict.reason).toBe(
            "Internal data headed to an address that first appeared in outside email (claims-desk.io)",
        );
    });

    it("asks when only public data goes to an address from outside content", () => {
        const verdict = check("send_email", to("refunds@claims-desk.io", [label("web:claims-desk.io")]));
        expect(verdict.outcome).toBe("ask");
        expect(verdict.reason).toBe("Recipient first appeared in web content (claims-desk.io)");
    });
});

describe("daily payment cap", () => {
    it("allows a payment that keeps today's total under the cap", () => {
        const verdict = check("pay_invoice.daily-cap", {
            paidTodayEur: 899,
            args: [arg("amount", "4,950.00 EUR", "amount")],
        });
        expect(verdict).toEqual({
            outcome: "allow",
            reason: "5,849 of 50,000 EUR today",
            rule: "pay_invoice.daily-cap",
            mode: "block",
        });
    });

    it("allows a total of exactly 50,000 EUR", () => {
        const verdict = check("pay_invoice.daily-cap", { paidTodayEur: 50_000 });
        expect(verdict.outcome).toBe("allow");
        expect(verdict.reason).toBe("50,000 of 50,000 EUR today");
    });

    it("blocks a payment that would go over the cap", () => {
        const verdict = check("pay_invoice.daily-cap", {
            paidTodayEur: 45_000,
            args: [arg("amount", "6,400.00 EUR", "amount")],
        });
        expect(verdict.outcome).toBe("block");
        expect(verdict.reason).toBe("Would reach 51,400 of 50,000 EUR today");
    });
});

describe("per-run counters", () => {
    it.each([
        ["send_email.per-run", 20, "Email 20 of 20 in this run", "Email 21 of 20 in this run"],
        ["label_thread", 50, "Label 50 of 50 in this run", "Label 51 of 50 in this run"],
        ["run_tests", 5, "Test run 5 of 5 in this run", "Test run 6 of 5 in this run"],
    ])("%s allows up to %i calls and blocks the next one", (rule, cap, atCap, over) => {
        expect(check(rule, { callsInRun: cap })).toMatchObject({ outcome: "allow", reason: atCap });
        expect(check(rule, { callsInRun: cap + 1 })).toMatchObject({ outcome: "block", reason: over });
    });
});

describe("fixed action and egress rules", () => {
    it("names the supplier found in supplier records", () => {
        const verdict = check("lookup_supplier", { args: [arg("supplier_id", "SUP-004417", "id")] });
        expect(verdict.reason).toBe("SUP-004417 is in supplier records");
        expect(check("lookup_supplier").reason).toBe("The supplier is in supplier records");
    });

    it("allows tickets and #deploys posts", () => {
        expect(check("create_ticket")).toMatchObject({
            outcome: "allow",
            reason: "The ticket's customer matches the sender",
        });
        expect(check("post_slack")).toMatchObject({
            outcome: "allow",
            reason: "The #deploys webhook is on the allowlist",
        });
    });
});

describe("deploys", () => {
    const env = (value: string) => ({ args: [arg("environment", value, "text")] });

    it("lets non-production deploys run, treating a missing environment as staging", () => {
        expect(check("deploy_service").reason).toBe("staging deploys run without asking");
        expect(check("deploy_service", env("preview"))).toMatchObject({
            outcome: "allow",
            reason: "preview deploys run without asking",
        });
    });

    it("asks before a production deploy", () => {
        expect(check("deploy_service", env("production"))).toMatchObject({
            outcome: "ask",
            reason: "Production deploys ask before running",
        });
    });

    it("lets a production deploy run under an always-approve grant", () => {
        expect(check("deploy_service", { ...env("production"), grant: "grt_31" })).toMatchObject({
            outcome: "allow",
            reason: "Matched always-approve grant grt_31",
        });
    });
});

describe("approval rules", () => {
    it("always asks a person first, and has no mode", () => {
        expect(check("refund_order", { tool: "refund_order" })).toEqual({
            outcome: "ask",
            reason: "refund_order always asks a human first",
            rule: "refund_order",
            mode: null,
        });
    });

    it("allows the call under an always-approve grant", () => {
        expect(check("pay_invoice", { grant: "grt_07" })).toMatchObject({
            outcome: "allow",
            reason: "Matched always-approve grant grt_07",
        });
    });
});

describe("other rules before the call", () => {
    it("allow the call with the rule's summary", () => {
        expect(check("search_docs")).toEqual({
            outcome: "allow",
            reason: "Labels docs from mcp:docs.acme.internal",
            rule: "search_docs",
            mode: "block",
        });
    });
});

describe("evaluateSource", () => {
    const fetchPage = specOf("fetch_page");

    it("blocks a listed domain and its subdomains", () => {
        expect(evaluateSource(fetchPage, "web:nwparts-secure.example", false)).toEqual({
            outcome: "block",
            reason: "nwparts-secure.example is on the block list",
            rule: "fetch_page",
            mode: "block",
        });
        const sub = evaluateSource(fetchPage, "web:invoices.nwparts-secure.example", false);
        expect(sub.outcome).toBe("block");
        expect(sub.reason).toBe("invoices.nwparts-secure.example is on the block list");
    });

    it("does not block a domain that only ends with the same letters", () => {
        expect(evaluateSource(fetchPage, "web:my-nwparts-secure.example", false).outcome).toBe("pass");
    });

    it("passes hosted search unscanned, since the page text never reaches Quard", () => {
        const verdict = evaluateSource(specOf("web_search"), "search:northwind-parts.example", true);
        expect(verdict.outcome).toBe("pass");
        expect(verdict.reason).toBe(
            "Consulted domains are allowed. Page text never reached Quard, so it was not scanned",
        );
    });

    it("passes and labels other content", () => {
        const verdict = evaluateSource(fetchPage, "web:supplier-portal.example", false);
        expect(verdict.outcome).toBe("pass");
        expect(verdict.reason).toBe("Labeled web:supplier-portal.example. Nothing suspect found");
    });
});

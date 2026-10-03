// @vitest-environment node
import { describe, expect, it } from "vitest";
import { approvalOf, blockerOf, buildPinned, callsTo, marked } from "../../../../../test/data-scripts-paths/build";
import {
    delegationLoop,
    droppedCap,
    forwardedEmail,
    stalePrices,
    strippedEmail,
    unguardedExport,
} from "./incident-runs";

describe("droppedCap", () => {
    it("drops the user's spending limit from the brief to billing", () => {
        const run = buildPinned(droppedCap);
        const brief = marked(run, "entry");
        expect(brief.link).toMatchObject({ kind: "delegation", from: "orchestrator", to: "billing" });
        expect(brief.detail).not.toContain("2,000 EUR");
        expect(marked(run, "carry").id).toBe(brief.id);
    });

    it("pays the first invoice after approval, then the daily cap blocks the second", () => {
        const run = buildPinned(droppedCap);
        const [first, second] = callsTo(run, "pay_invoice");
        expect(first.status).toBe("ok");
        expect(approvalOf(run, first)?.approval).toMatchObject({ state: "approved once", by: "priya@acme.com" });
        expect(second.id).toBe(marked(run, "damage").id);
        expect(blockerOf(run, second)?.detail).toBe("Would reach 51,499 of 50,000 EUR today");
    });

    it("reports back to the orchestrator", () => {
        const run = buildPinned(droppedCap);
        const report = run.detail.steps.find((step) => step.kind === "message");
        expect(report?.link).toMatchObject({ from: "billing", to: "orchestrator" });
        expect(run.detail.summary.status).toBe("blocked");
    });
});

describe("forwardedEmail", () => {
    it("flags the hidden text without stripping it", () => {
        const run = buildPinned(forwardedEmail);
        const entry = marked(run, "entry");
        expect(entry.output?.label.origin).toBe("email:claims-desk.io");
        const scan = run.detail.steps.find((step) => step.parentId === entry.id && step.guard?.guard === "source");
        expect(scan?.guard?.outcome).toBe("flag");
        expect(scan?.guard?.scan?.jevScore).toBe(0.88);
    });

    it("blocks support from emailing the order history out", () => {
        const run = buildPinned(forwardedEmail);
        const send = marked(run, "damage");
        expect(send.agent).toBe("support");
        expect(blockerOf(run, send)?.guard?.guard).toBe("egress");
        expect(marked(run, "carry").link?.channel).toBe("queue");
    });
});

describe("unguardedExport", () => {
    it("uploads the contacts because export_contacts has no guard", () => {
        const run = buildPinned(unguardedExport);
        const upload = marked(run, "damage");
        expect(upload.name).toBe("export_contacts");
        expect(upload.status).toBe("ok");
        expect(run.detail.steps.some((step) => step.parentId === upload.id)).toBe(false);
        expect(upload.output?.summary).toBe("Uploaded 4,812 contacts to partners-sync.example");
    });

    it("starts from the edited docs and completes", () => {
        const run = buildPinned(unguardedExport);
        expect(marked(run, "entry").output?.label.origin).toBe("mcp:docs.acme.internal");
        expect(run.detail.summary.status).toBe("completed");
    });
});

describe("stalePrices", () => {
    it("times out on the supplier lookup and falls back to cached notes", () => {
        const run = buildPinned(stalePrices);
        const lookup = marked(run, "entry");
        expect(lookup.status).toBe("error");
        expect(lookup.error).toBe("Timed out after 30 s");
        const cached = run.detail.steps.find((step) => step.kind === "memory_read");
        expect(cached?.memory).toMatchObject({ store: "supplier-notes", key: "SUP-002190/prices" });
        expect(cached?.memory?.label.origin).toBe("tool:lookup_supplier");
    });

    it("sends the stale quote, which the allowlist lets through", () => {
        const run = buildPinned(stalePrices);
        const send = marked(run, "damage");
        expect(send.status).toBe("ok");
        expect(send.detail).toBe("To f…@fabrikam.example");
        expect(run.detail.summary.status).toBe("completed");
    });
});

describe("delegationLoop", () => {
    it("sends the question to researcher four times before the loop limit blocks the fifth", () => {
        const run = buildPinned(delegationLoop);
        const handoffs = run.detail.steps.filter((step) => step.kind === "handoff");
        expect(handoffs.map((step) => step.detail)).toEqual(
            [1, 2, 3, 4].map((n) => `Compare carrier prices for 12 pallets to Lyon (attempt ${n}).`),
        );
        const sends = callsTo(run, "delegate");
        expect(sends).toHaveLength(5);
        expect(blockerOf(run, sends[4])?.detail).toBe("Loop: 5 handoffs back and forth, orchestrator and researcher");
    });

    it("stops after the refusal and has no incident marks", () => {
        const run = buildPinned(delegationLoop);
        expect(run.detail.steps.at(-1)?.detail).toBe("Read the refusal and stopped");
        expect(run.built.marks).toEqual([]);
        expect(run.detail.summary.status).toBe("blocked");
    });
});

describe("strippedEmail", () => {
    it("strips instructions from the email but keeps the reply address", () => {
        const run = buildPinned(strippedEmail);
        const [inbox] = callsTo(run, "read_inbox");
        const scan = run.detail.steps.find((step) => step.parentId === inbox.id && step.guard?.guard === "source");
        expect(scan?.guard?.outcome).toBe("strip");
        expect(scan?.detail).toBe("1 chunk of instructions aimed at an AI was removed");
    });

    it("blocks support from writing to the address from the email, with no incident marks", () => {
        const run = buildPinned(strippedEmail);
        const [send] = callsTo(run, "send_email");
        expect(send.status).toBe("blocked");
        expect(blockerOf(run, send)?.guard?.guard).toBe("egress");
        expect(run.built.marks).toEqual([]);
    });
});

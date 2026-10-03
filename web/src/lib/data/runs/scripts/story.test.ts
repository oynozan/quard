// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MINUTE, NOW } from "../../rng";
import { approvalOf, buildRun, callsTo, guardsOf, marked } from "../../../../../test/data-scripts-paths/build";
import { STORY_APPROVAL_AT, STORY_RUN_ID, STORY_STARTED_AT, supplierStory } from "./story";

const story = () => buildRun(supplierStory, STORY_RUN_ID, STORY_STARTED_AT);

describe("supplierStory", () => {
    it("starts shortly before the payment asks for approval, four minutes ago", () => {
        expect(STORY_APPROVAL_AT).toBe(NOW - 4 * MINUTE);
        expect(STORY_STARTED_AT).toBe(STORY_APPROVAL_AT - 14_900);
        expect(story().detail.summary.startedAt).toBe(STORY_STARTED_AT);
    });

    it("passes the work from orchestrator to researcher to billing", () => {
        const { detail } = story();
        expect(detail.agents.map((agent) => [agent.name, agent.parent])).toEqual([
            ["orchestrator", null],
            ["researcher", "orchestrator"],
            ["billing", "researcher"],
        ]);
        expect(detail.graph.edges.map((edge) => edge.kind)).toEqual(["delegation", "handoff"]);
    });

    it("flags the hidden text on the supplier page", () => {
        const run = story();
        const [fetch] = callsTo(run, "fetch_page");
        expect(fetch.output?.label.origin).toBe("web:supplier-portal.example");
        const [scan] = guardsOf(run, fetch);
        expect(scan.guard?.outcome).toBe("flag");
        expect(scan.guard?.scan?.findings).toEqual(["hidden text", "instructions aimed at an AI"]);
        expect(scan.guard?.scan?.jevScore).toBe(0.94);
    });

    it("leaves the payment to the planted IBAN waiting on request apr_7f31", () => {
        const run = story();
        const [pay] = callsTo(run, "pay_invoice");
        expect(pay.startedAt).toBe(STORY_APPROVAL_AT);
        expect(pay.status).toBe("waiting");
        expect(pay.detail).toBe("4,950.00 EUR to DE89…3000");
        expect(approvalOf(run, pay)?.approval).toMatchObject({ requestId: "apr_7f31", state: "waiting", by: null });
        expect(run.detail.summary.status).toBe("waiting");
    });

    it("traces the IBAN back to the supplier page, not to supplier records", () => {
        const [pay] = callsTo(story(), "pay_invoice");
        const iban = pay.args.find((arg) => arg.name === "iban");
        expect(iban?.valueLabel.appearances[0].label.origin).toBe("web:supplier-portal.example");
        const origins = iban?.valueLabel.appearances.map((item) => item.label.origin);
        expect(origins).not.toContain("tool:lookup_supplier");
    });

    it("counts what was already paid today toward the daily cap", () => {
        const run = story();
        const [pay] = callsTo(run, "pay_invoice");
        const cap = guardsOf(run, pay).find((step) => step.name === "pay_invoice.daily-cap");
        expect(cap?.detail).toBe("23,350 of 50,000 EUR today");
    });

    it("marks the page, the handoff, billing's decision and the payment", () => {
        const run = story();
        expect(marked(run, "entry").name).toBe("fetch_page");
        expect(marked(run, "carry").link).toMatchObject({ from: "researcher", to: "billing", kind: "handoff" });
        expect(marked(run, "turning")).toMatchObject({ kind: "model_call", agent: "billing" });
        expect(marked(run, "damage").name).toBe("pay_invoice");
    });
});

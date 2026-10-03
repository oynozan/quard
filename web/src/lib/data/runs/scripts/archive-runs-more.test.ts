// @vitest-environment node
import { describe, expect, it } from "vitest";
import { approvalOf, blockerOf, buildPinned, callsTo, marked } from "../../../../../test/data-scripts-paths/build";
import { buildLogDeploy, misreadNote, triageLoop, wrongRecord } from "./archive-runs-more";

describe("misreadNote", () => {
    it("sends a correct note through the queue that support misreads", () => {
        const run = buildPinned(misreadNote);
        const note = marked(run, "entry");
        expect(note.id).toBe(marked(run, "carry").id);
        expect(note.link).toMatchObject({ kind: "handoff", channel: "queue", from: "inbox-triage", to: "support" });
        expect(note.detail).toContain("Already refunded on 28 Sep: do not refund again.");
    });

    it("stops when priya denies the second refund", () => {
        const run = buildPinned(misreadNote);
        const refund = marked(run, "damage");
        expect(refund.name).toBe("refund_order");
        expect(approvalOf(run, refund)?.approval).toMatchObject({ state: "denied", by: "priya@acme.com" });
        expect(run.detail.summary.status).toBe("blocked");
    });
});

describe("buildLogDeploy", () => {
    it("reads the build log without any guard", () => {
        const run = buildPinned(buildLogDeploy);
        const log = marked(run, "entry");
        expect(log.name).toBe("read_build_log");
        expect(log.output?.label.origin).toBe("unknown:read_build_log");
        expect(run.detail.steps.some((step) => step.kind === "guard_decision" && step.parentId === log.id)).toBe(false);
    });

    it("deploys to production after marco approves once, then reports it", () => {
        const run = buildPinned(buildLogDeploy);
        const deploy = marked(run, "damage");
        expect(deploy.status).toBe("ok");
        expect(approvalOf(run, deploy)?.approval).toMatchObject({ state: "approved once", by: "marco@acme.com" });
        expect(callsTo(run, "post_slack")[0].output?.summary).toBe("Posted to #deploys");
        expect(run.detail.summary.status).toBe("completed");
    });
});

describe("wrongRecord", () => {
    it("marks the CRM answer with the mixed-up record as the entry point", () => {
        const run = buildPinned(wrongRecord);
        const lookup = marked(run, "entry");
        expect(lookup.name).toBe("crm_lookup");
        expect(lookup.output?.label).toEqual({
            origin: "mcp:crm.acme.internal",
            trust: "trusted",
            sensitivity: "internal",
        });
    });

    it("opens the ticket for the wrong customer and completes", () => {
        const run = buildPinned(wrongRecord);
        const ticket = marked(run, "damage");
        expect(ticket.status).toBe("ok");
        expect(ticket.output?.summary).toBe("Ticket TCK-88199 opened for CUS-0040277");
        expect(run.detail.summary.status).toBe("completed");
    });
});

describe("triageLoop", () => {
    it("sends the claim to support four times before the loop limit blocks the fifth", () => {
        const run = buildPinned(triageLoop);
        const handoffs = run.detail.steps.filter((step) => step.kind === "handoff");
        expect(handoffs.map((step) => step.detail)).toEqual(
            [1, 2, 3, 4].map((n) => `Claim for order 118-4380 (sent ${n} of 5).`),
        );
        const sends = callsTo(run, "delegate");
        expect(sends).toHaveLength(5);
        expect(sends[4].status).toBe("blocked");
        expect(blockerOf(run, sends[4])?.detail).toBe("Loop: 5 handoffs back and forth, inbox-triage and support");
    });

    it("gets a reply from support after each claim that went through", () => {
        const run = buildPinned(triageLoop);
        const replies = run.detail.steps.filter((step) => step.kind === "message");
        expect(replies).toHaveLength(4);
        expect(replies[0].link).toMatchObject({ from: "support", to: "inbox-triage" });
    });

    it("marks the first handoff as the carrier and the blocked send as damage", () => {
        const run = buildPinned(triageLoop);
        const firstHandoff = run.detail.steps.find((step) => step.kind === "handoff");
        expect(marked(run, "carry").id).toBe(firstHandoff?.id);
        expect(marked(run, "damage").id).toBe(callsTo(run, "delegate")[4].id);
        const turns = run.built.marks.filter((mark) => mark.role === "turning");
        expect(turns).toHaveLength(1);
        expect(run.detail.summary.status).toBe("blocked");
    });
});

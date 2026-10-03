// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { runLimit } from "../../guards/limits";
import { BACKEND_OUTAGE, OUTAGE_REASON } from "../../guards/outage";
import { RunBuilder } from "../build/builder";
import { calls, firstRun, has, lastModel, planOf, toolArg, write } from "../../../../../test/data-runs-generate/runs";
import { FORWARD_ADDRESS } from "./content";
import { deployWork, supportWork, triageWork } from "./work-ops";
import type { BuiltRun } from "../build/builder";
import type { RunPlan } from "./plan";

const support = (b: RunBuilder, plan: RunPlan) => supportWork(b, plan, true);
const inbox = (run: BuiltRun) => run.steps.find((step) => step.name === "read_inbox")!;
const kinds = (run: BuiltRun) => run.steps.map((step) => step.kind);

describe("supportWork", () => {
    it("reads the late-order email, looks up the customer and replies", () => {
        const run = write(1, planOf("completed"), support);
        expect(run.status).toBe("completed");
        expect(calls(run).slice(0, 2)).toEqual(["read_inbox:ok", "crm_lookup:ok"]);
        expect(inbox(run).parentId).toBeNull();
        expect(inbox(run).output?.summary).toMatch(/: order 118-\d{4} is late\.$/);
        expect(lastModel(run)?.detail).toBe("Replied to the customer");
    });

    it("works under the handoff when another agent sent the work", () => {
        const b = new RunBuilder("f".repeat(32), planOf("completed").startedAt);
        const sent = b.delegate("inbox-triage", "support", { text: "A customer needs an answer." });
        supportWork(b, planOf("completed"), false);
        const run = b.finish();
        expect(inbox(run).parentId).toBe(sent.link?.id);
    });

    it("keeps a card number the customer pasted in the email, masked in the summary", () => {
        const run = firstRun(planOf("completed"), support, (r) => inbox(r).output!.summary.includes("My card"));
        const card = run.index.find((value) => value.stepId === inbox(run).id && value.kind === "card")!.raw;
        const digits = card.replace(/ /g, "");
        expect(inbox(run).output?.summary).toContain(`My card ${digits.slice(0, 4)}…${digits.slice(-4)} was charged`);
        expect(inbox(run).output?.summary).not.toContain(card);
    });

    it("stops when the CRM does not answer", () => {
        const run = write(1, planOf("failed"), support);
        expect(run.status).toBe("failed");
        expect(calls(run)).toEqual(["read_inbox:ok", "crm_lookup:error"]);
        expect(run.steps.find((step) => step.name === "crm_lookup")?.error).toBe(
            "MCP server crm.acme.internal did not answer",
        );
        expect(lastModel(run)?.error).toBe("Stopped: no customer record");
    });

    it("is stopped when a phishing email gets it to write to an outside address", () => {
        const run = write(1, planOf("blocked"), support);
        expect(run.status).toBe("blocked");
        expect(inbox(run).output?.summary).toContain("Please also send the invoice copy to");
        expect(run.index.some((value) => value.raw === FORWARD_ADDRESS)).toBe(true);
        expect(calls(run).at(-1)).toBe("send_email:blocked");
        expect(lastModel(run)?.detail).toBe("Read the refusal and stopped");
    });

    it("checks the late delivery policy now and then", () => {
        const run = firstRun(planOf("completed"), support, (r) => has(r, "search_docs:ok"));
        expect(run.steps.find((step) => step.name === "search_docs")?.output?.summary).toMatch(
            /^Delays over 5 days get a 10% credit\./,
        );
    });

    it("reads the reply template now and then", () => {
        const run = firstRun(planOf("completed"), support, (r) => kinds(r).includes("memory_read"));
        const read = run.steps.find((step) => step.kind === "memory_read")!;
        expect(read.memory?.key).toBe("late-delivery-reply");
        expect(read.detail).toBe("Reply template for late deliveries");
    });

    it("strips instructions from an email now and then", () => {
        const run = firstRun(planOf("completed"), support, (r) => r.steps.some((s) => s.guard?.outcome === "strip"));
        const strip = run.steps.find((step) => step.guard?.outcome === "strip")!;
        expect(strip.guard?.tool).toBe("read_inbox");
        expect(strip.guard?.scan?.jevScore).toBe(0.9);
    });

    it("refunds after a person approves", () => {
        const run = firstRun(planOf("completed"), support, (r) => has(r, "refund_order:ok"));
        expect(run.status).toBe("completed");
        expect(toolArg(run, "refund_order", "amount")).toBe("24.90 EUR");
    });

    it("gets every refund approved in a run planned to complete", () => {
        for (let n = 1; n <= 40; n++) {
            const run = write(n, planOf("completed"), support);
            expect(run.status).toBe("completed");
            for (const approval of run.approvals) expect(approval.answer).toBe("approve once");
        }
    });

    it("ends blocked when the backend outage keeps the refund from reaching a person", () => {
        const plan = planOf("completed", { startedAt: BACKEND_OUTAGE.from + 60_000 });
        const run = firstRun(plan, support, (r) => has(r, "refund_order:blocked"));
        expect(run.status).toBe("blocked");
        expect(run.approvals).toEqual([]);
        expect(run.steps.some((step) => step.guard?.reason === OUTAGE_REASON)).toBe(true);
    });

    it("never offers a refund when the run is too new to ask", () => {
        for (let n = 1; n <= 40; n++) {
            expect(calls(write(n, planOf("completed", { canAsk: false }), support)).join()).not.toContain("refund");
        }
    });

    it("opens a ticket or emails the customer otherwise", () => {
        const ticket = firstRun(planOf("completed"), support, (r) => has(r, "create_ticket:ok"));
        expect(ticket.steps.find((step) => step.name === "create_ticket")?.output?.summary).toBe("Ticket opened");
        const email = firstRun(planOf("completed"), support, (r) => has(r, "send_email:ok"));
        expect(toolArg(email, "send_email", "subject")).toMatch(/^About order 118-\d{4}$/);
    });
});

describe("triageWork", () => {
    const loops = runLimit("loops");
    const LOOP_LIMIT = loops.limit;
    afterEach(() => {
        loops.limit = LOOP_LIMIT;
    });

    it("reads and labels one to three threads, then files the mail", () => {
        for (let n = 1; n <= 20; n++) {
            const run = write(n, planOf("completed"), triageWork);
            const reads = run.steps.filter(
                (step) => step.agent === "inbox-triage" && step.kind === "tool_call" && step.name === "read_inbox",
            );
            expect(reads.length).toBeGreaterThanOrEqual(1);
            expect(reads.length).toBeLessThanOrEqual(3);
            const labels = run.steps.filter((step) => step.name === "label_thread" && step.kind === "tool_call");
            for (const step of labels) {
                expect(["orders", "refunds", "claims", "vendors"]).toContain(step.args[1].value);
            }
        }
        const plain = firstRun(planOf("completed"), triageWork, (r) => !has(r, "delegate:ok"));
        expect(lastModel(plain)?.detail).toBe("Filed the new mail");
    });

    it("hands a customer to support over the queue now and then", () => {
        const run = firstRun(planOf("completed"), triageWork, (r) => has(r, "delegate:ok"));
        const handoff = run.steps.find((step) => step.kind === "handoff")!;
        expect(handoff.link?.kind).toBe("handoff");
        expect(handoff.link?.channel).toBe("queue");
        expect(handoff.link?.to).toBe("support");
        expect(lastModel(run, "inbox-triage")?.detail).toBe("Filed the new mail");
    });

    it("files the mail itself when the run limits block the handoff", () => {
        loops.limit = 1;
        const run = firstRun(planOf("completed"), triageWork, (r) => has(r, "delegate:blocked"));
        expect(run.steps.some((step) => step.agent === "support")).toBe(false);
        expect(lastModel(run)?.detail).toBe("Filed the new mail");
    });

    it("is stopped at the bank-change email", () => {
        const run = write(1, planOf("blocked"), triageWork);
        expect(run.status).toBe("blocked");
        expect(calls(run).at(-1)).toBe("read_inbox:blocked");
        const blocked = run.steps.find((step) => step.name === "read_inbox" && step.status === "blocked")!;
        expect(blocked.output?.summary).toContain("Bank details changed");
        expect(lastModel(run)?.detail).toBe("Read the refusal and stopped");
    });

    it("fails when the model provider errors", () => {
        const run = firstRun(planOf("failed"), triageWork, (r) => !has(r, "delegate:ok"));
        expect(run.status).toBe("failed");
        expect(lastModel(run)?.error).toBe("The provider returned 500 Internal Server Error");
    });

    it("stops without its own error when the support handoff already failed", () => {
        const run = firstRun(planOf("failed"), triageWork, (r) => has(r, "delegate:ok"));
        expect(run.status).toBe("failed");
        expect(calls(run).at(-1)).toBe("crm_lookup:error");
        expect(run.steps.some((step) => step.error === "The provider returned 500 Internal Server Error")).toBe(false);
        expect(run.steps.filter((step) => step.agent === "inbox-triage").at(-1)?.kind).not.toBe("model_call");
    });
});

describe("deployWork", () => {
    const deployed = (run: BuiltRun) =>
        run.steps.find((step) => step.name === "deploy_service" && step.kind === "tool_call")!;
    const arg = (run: BuiltRun, name: string) => deployed(run).args.find((a) => a.name === name)?.value;

    it("tests, deploys and posts to #deploys", () => {
        const run = firstRun(planOf("completed"), deployWork, (r) => r.status === "completed");
        expect(calls(run)[0]).toBe("run_tests:ok");
        expect(calls(run).at(-1)).toBe("post_slack:ok");
        expect(toolArg(run, "post_slack", "channel")).toBe("#deploys");
        expect(lastModel(run)?.detail).toBe("Reported the deploy");
    });

    it("deploys the pinned sites to production from main", () => {
        const run = firstRun(planOf("completed"), deployWork, (r) =>
            ["docs-site", "status-page"].includes(arg(r, "service")!),
        );
        expect(arg(run, "environment")).toBe("production");
        expect(arg(run, "ref")).toBe("main");
        expect(arg(run, "commit")).toBeUndefined();
        // A standing grant covers these deploys, so nobody is asked.
        expect(run.approvals).toEqual([]);
        expect(run.status).toBe("completed");
    });

    it("deploys other services by commit, after reading the build log now and then", () => {
        const run = firstRun(planOf("completed"), deployWork, (r) => has(r, "read_build_log:ok"));
        expect(arg(run, "commit")).toMatch(/^[0-9a-f]{8}$/);
        expect(run.steps.find((step) => step.name === "read_build_log")?.output?.summary).toContain(arg(run, "commit"));
    });

    it("stops when the test runner loses its connection", () => {
        const run = write(1, planOf("failed"), deployWork);
        expect(run.status).toBe("failed");
        expect(calls(run)).toEqual(["run_tests:error"]);
        expect(lastModel(run)?.detail).toBe("Stopped: the tests did not finish");
    });

    it("stops when marco denies a production deploy", () => {
        const run = write(1, planOf("blocked"), deployWork);
        expect(run.status).toBe("blocked");
        expect(calls(run).at(-1)).toBe("deploy_service:blocked");
        expect(run.approvals.at(-1)?.by).toBe("marco@acme.com");
        expect(run.approvals.at(-1)?.answer).toBe("deny");
        expect(lastModel(run)?.detail).toBe("Read the denial and stopped");
    });

    it("always ends blocked when planned to, with an unpinned service asking for production", () => {
        for (let n = 1; n <= 40; n++) {
            const run = write(n, planOf("blocked"), deployWork);
            expect(run.status).toBe("blocked");
            expect(["docs-site", "status-page"]).not.toContain(arg(run, "service"));
            expect(arg(run, "environment")).toBe("production");
            expect(run.approvals.map((approval) => approval.answer)).toEqual(["deny"]);
        }
    });

    it("gets every deploy approved in a run planned to complete", () => {
        for (let n = 1; n <= 40; n++) {
            const run = write(n, planOf("completed"), deployWork);
            expect(run.status).toBe("completed");
            for (const approval of run.approvals) expect(approval.answer).toBe("approve once");
        }
    });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RunBuilder } from "../build/builder";
import { PLANTED, SEARCH_QUERIES, SUPPLIERS } from "../../values/pool";
import {
    calls,
    firstRun,
    has,
    lastModel,
    planOf,
    rawArg,
    runId,
    STARTED,
    toolArg,
    write,
} from "../../../../../test/data-runs-generate/runs";
import { answerFor, billingWork, researcherWork } from "./work-desk";
import type { RunPlan } from "./plan";

const billing = (b: RunBuilder, plan: RunPlan) => billingWork(b, plan, false);
const billingRoot = (b: RunBuilder, plan: RunPlan) => billingWork(b, plan, true);

describe("answerFor", () => {
    it("approves once unless the run is planned to end blocked, after a wait of whole seconds", () => {
        const b = new RunBuilder(runId(1), STARTED);
        for (const ending of ["completed", "failed"] as const) {
            const answers = Array.from({ length: 50 }, () => answerFor(b, planOf(ending), "marco@acme.com"));
            for (const plan of answers) {
                expect(plan.answer).toBe("approve once");
                expect(plan.by).toBe("marco@acme.com");
                expect(plan.waitMs! % 1000).toBe(0);
                expect(plan.waitMs).toBeGreaterThanOrEqual(35_000);
                expect(plan.waitMs).toBeLessThanOrEqual(480_000);
            }
        }
    });

    it("denies in a run planned to end blocked", () => {
        expect(answerFor(new RunBuilder(runId(1), STARTED), planOf("blocked")).answer).toBe("deny");
    });

    it("leaves the approver open when none is given", () => {
        expect(answerFor(new RunBuilder(runId(2), STARTED), planOf("completed")).by).toBeUndefined();
    });
});

describe("researcherWork", () => {
    it("fetches pages and writes up the findings", () => {
        const run = write(1, planOf("completed"), researcherWork);
        expect(run.status).toBe("completed");
        expect(calls(run).every((call) => call.endsWith(":ok"))).toBe(true);
        expect(calls(run).filter((call) => call.startsWith("fetch_page")).length).toBeGreaterThan(0);
        expect(lastModel(run)?.detail).toBe("Wrote up the findings");
    });

    it("asks for each page before fetching it", () => {
        const fetches = (r: ReturnType<typeof write>) => calls(r).filter((call) => call === "fetch_page:ok");
        const run = firstRun(planOf("completed"), researcherWork, (r) => fetches(r).length === 3);
        const asks = run.steps.filter((step) => step.kind === "model_call" && step.detail === "Asked for fetch_page");
        expect(asks).toHaveLength(3);
    });

    it("opens the first source of a hosted search first", () => {
        const run = firstRun(planOf("completed"), researcherWork, (r) => has(r, "web_search:ok"));
        const search = run.steps.find((step) => step.name === "web_search")!;
        const fetched = toolArg(run, "fetch_page", "url");
        expect(search.output?.summary).toContain("sources consulted");
        expect(SEARCH_QUERIES.map((query) => query.sources[0])).toContain(fetched);
        expect(run.index.some((value) => value.raw === fetched && value.stepId === search.id)).toBe(true);
    });

    it("reads yesterday's cached rates before starting, now and then", () => {
        const run = firstRun(planOf("completed"), researcherWork, (r) => r.steps[0].kind === "memory_read");
        expect(run.steps[0].memory?.store).toBe("research-cache");
        expect(run.steps[0].memory?.key).toBe("ecb.europa.eu");
        expect(run.steps[0].detail).toBe("Cached reference rates from yesterday");
    });

    it("caches what it found, now and then", () => {
        const run = firstRun(planOf("completed"), researcherWork, (r) => r.steps.at(-1)?.kind === "memory_write");
        expect(run.steps.at(-1)?.detail).toBe("Wrote research-cache/ecb.europa.eu");
    });

    it("stops at the refusal when the last page is the bank-change notice", () => {
        const run = firstRun(planOf("blocked"), researcherWork, (r) => r.status === "blocked");
        const blocked = run.steps.find((step) => step.status === "blocked" && step.kind === "tool_call")!;
        expect(blocked.args[0].value).toBe("https://pay-update.example/notice/bank-change");
        expect(lastModel(run)?.detail).toBe("Read the refusal and stopped");
    });

    it("stops with an error when the last page does not load", () => {
        const run = write(1, planOf("failed"), researcherWork);
        expect(run.status).toBe("failed");
        expect(calls(run).at(-1)).toBe("fetch_page:error");
        expect(run.steps.find((step) => step.status === "error" && step.kind === "tool_call")?.error).toBe(
            "429 Too Many Requests",
        );
        expect(lastModel(run)?.error).toBe("Stopped after the page failed to load");
    });

    it("is always stopped at the bank-change notice, whatever the page scan rolled", () => {
        for (let n = 1; n <= 60; n++) {
            const run = write(n, planOf("blocked"), researcherWork);
            expect(run.status).toBe("blocked");
            const last = run.steps.filter((step) => step.name === "fetch_page" && step.kind === "tool_call").at(-1)!;
            expect(last.status).toBe("blocked");
            expect(run.steps.filter((step) => step.parentId === last.id).at(-1)?.guard?.outcome).toBe("block");
        }
    });

    it("flags hidden text on some pages and strips instructions from others", () => {
        const scans = (outcome: string) => (run: ReturnType<typeof write>) =>
            run.steps.some((step) => step.guard?.guard === "source" && step.guard.outcome === outcome);
        const flagged = firstRun(planOf("completed"), researcherWork, scans("flag"));
        const flag = flagged.steps.find((step) => step.guard?.outcome === "flag")!;
        expect(flag.guard?.reason).toBe("Hidden text aimed at an AI");
        expect(flag.guard?.scan?.jevScore).toBe(0.71);
        const stripped = firstRun(planOf("completed"), researcherWork, scans("strip"));
        const strip = stripped.steps.find((step) => step.guard?.outcome === "strip")!;
        expect(strip.guard?.scan?.findings).toEqual(["instructions aimed at an AI"]);
    });
});

describe("billingWork", () => {
    it("states the task in the first model call when billing starts the run", () => {
        const run = write(1, planOf("completed"), billingRoot);
        const first = run.steps[0];
        const supplierId = toolArg(run, "lookup_supplier", "supplier_id");
        expect(first.detail).toBe("Asked for lookup_supplier");
        expect(run.index.some((value) => value.stepId === first.id && value.raw === supplierId)).toBe(true);
    });

    it("starts without a task of its own when another agent sent the work", () => {
        const run = write(1, planOf("completed"), billing);
        expect(run.steps[0].detail).toBe("Asked for lookup_supplier");
        expect(run.index.some((value) => value.stepId === run.steps[0].id)).toBe(false);
    });

    it("looks up the supplier it was given", () => {
        const run = write(1, planOf("completed"), (b, plan) => billingWork(b, plan, false, "SUP-003305"));
        expect(toolArg(run, "lookup_supplier", "supplier_id")).toBe("SUP-003305");
    });

    it("never picks the first supplier on its own", () => {
        for (let n = 1; n <= 40; n++) {
            expect(toolArg(write(n, planOf("completed"), billing), "lookup_supplier", "supplier_id")).not.toBe(
                SUPPLIERS[0].id,
            );
        }
    });

    it("stops when supplier records time out", () => {
        const run = write(1, planOf("failed"), billing);
        expect(run.status).toBe("failed");
        expect(calls(run)).toEqual(["lookup_supplier:error"]);
        const lookup = run.steps.find((step) => step.name === "lookup_supplier")!;
        expect(lookup.error).toBe("Timed out after 30 s");
        expect(lookup.durationMs).toBeGreaterThanOrEqual(30_000);
        expect(lastModel(run)?.detail).toBe("Stopped: supplier records did not answer");
    });

    it("tries to pay the planted IBAN from an inbox attachment and is stopped", () => {
        const run = write(1, planOf("blocked"), billing);
        expect(run.status).toBe("blocked");
        expect(calls(run)).toEqual(["lookup_supplier:ok", "get_invoice_pdf:ok", "pay_invoice:blocked"]);
        expect(toolArg(run, "get_invoice_pdf", "path")).toMatch(/^\/srv\/inbox-attachments\/.+\.pdf$/);
        expect(rawArg(run, "pay_invoice", "iban")).toBe(PLANTED.quarantinedIban);
        expect(lastModel(run)?.detail).toBe("Read the refusal and stopped");
    });

    it("is stopped at the quarantined IBAN without asking anyone, even in a run too new to ask", () => {
        for (let n = 1; n <= 30; n++) {
            const run = write(n, planOf("blocked", { canAsk: false }), billing);
            expect(run.status).toBe("blocked");
            expect(calls(run).at(-1)).toBe("pay_invoice:blocked");
            expect(rawArg(run, "pay_invoice", "iban")).toBe(PLANTED.quarantinedIban);
            expect(run.steps.some((step) => step.kind === "approval")).toBe(false);
        }
    });

    it("never pays when the run is too new to ask a human", () => {
        for (let n = 1; n <= 30; n++) {
            const run = write(n, planOf("completed", { canAsk: false }), billing);
            expect(has(run, "pay_invoice:ok") || has(run, "pay_invoice:blocked")).toBe(false);
            expect(calls(run).at(-1)).toBe("send_email:ok");
            expect(lastModel(run)?.detail).toBe("Reported back");
        }
    });

    it("pays an approved invoice and reports back", () => {
        const run = firstRun(planOf("completed"), billing, (r) => has(r, "pay_invoice:ok"));
        expect(run.status).toBe("completed");
        expect(run.approvals[0].answer).toBe("approve once");
        const supplier = SUPPLIERS.find((s) => s.id === toolArg(run, "lookup_supplier", "supplier_id"))!;
        expect(rawArg(run, "pay_invoice", "iban")).toBe(supplier.iban);
        expect(lastModel(run)?.detail).toBe("Reported back");
    });

    it("gets every payment approved in a run planned to complete", () => {
        for (let n = 1; n <= 40; n++) {
            const run = write(n, planOf("completed"), billing);
            expect(run.status).toBe("completed");
            for (const approval of run.approvals) expect(approval.answer).toBe("approve once");
        }
    });

    it("emails a remittance from the invoice folder instead of paying, now and then", () => {
        const run = firstRun(
            planOf("completed"),
            billing,
            (r) => has(r, "get_invoice_pdf:ok") && has(r, "send_email:ok"),
        );
        const supplier = SUPPLIERS.find((s) => s.id === toolArg(run, "lookup_supplier", "supplier_id"))!;
        const invoice = rawArg(run, "get_invoice_pdf", "path")!.match(/^\/srv\/invoices\/(.+)\.pdf$/)![1];
        expect(rawArg(run, "send_email", "to")).toBe(supplier.email);
        expect(rawArg(run, "send_email", "subject")).toBe(`Remittance for ${invoice}`);
    });

    it("reads and writes supplier notes now and then", () => {
        const read = firstRun(planOf("completed"), billing, (r) => r.steps.some((s) => s.kind === "memory_read"));
        const note = read.steps.find((step) => step.kind === "memory_read")!;
        expect(note.memory?.store).toBe("supplier-notes");
        expect(note.detail).toMatch(/^Notes on .+: pays on the 10th$/);
        const wrote = firstRun(planOf("completed"), billing, (r) => r.steps.some((s) => s.kind === "memory_write"));
        expect(wrote.steps.find((step) => step.kind === "memory_write")?.memory?.store).toBe("supplier-notes");
    });
});

import { labelFor } from "../../labels/origins";
import { chance, pick } from "../../rng";
import { PAGES, PLANTED, SEARCH_QUERIES, SUPPLIERS } from "../../values/pool";
import { FLAG_HIDDEN, pageNote, STRIP_PAGE } from "./content";
import type { ApprovalPlan } from "../build/approval";
import type { RunBuilder } from "../build/builder";
import type { RunPlan } from "./plan";

// Most requests are approved once; some are denied.
export function answerFor(b: RunBuilder, by?: string): ApprovalPlan {
    return {
        answer: chance(b.rng, 0.92) ? "approve once" : "deny",
        by,
        waitMs: b.int(35, 480) * 1000,
    };
}

export function researcherWork(b: RunBuilder, plan: RunPlan): void {
    const search = chance(b.rng, 0.35) ? pick(b.rng, SEARCH_QUERIES) : undefined;
    if (chance(b.rng, 0.2)) {
        b.memory("researcher", "read", "research-cache", "ecb.europa.eu", {
            label: labelFor("web:ecb.europa.eu"),
            summary: "Cached reference rates from yesterday",
        });
    }
    b.model("researcher", { calls: ["fetch_page"], search });
    const pages = b.int(1, 3);
    for (let i = 0; i < pages; i++) {
        const last = i === pages - 1;
        const blocked = plan.ending === "blocked" && last;
        const url = blocked
            ? "https://pay-update.example/notice/bank-change"
            : search && i === 0
              ? search.sources[0]
              : pick(b.rng, PAGES);
        const roll = b.rng();
        const fetched = b.tool("researcher", "fetch_page", {
            args: { url },
            output: pageNote(url),
            error: plan.ending === "failed" && last ? "429 Too Many Requests" : undefined,
            decide: roll < 0.05 ? FLAG_HIDDEN : roll < 0.08 ? STRIP_PAGE : undefined,
        });
        if (fetched.result === "blocked") {
            b.model("researcher", { detail: "Read the refusal and stopped" });
            b.end("blocked");
            return;
        }
        if (fetched.result === "error") {
            b.model("researcher", { error: "Stopped after the page failed to load" });
            b.end("failed");
            return;
        }
        if (!last) b.model("researcher", { calls: ["fetch_page"] });
    }
    b.model("researcher", { detail: "Wrote up the findings" });
    if (chance(b.rng, 0.2)) b.memory("researcher", "write", "research-cache", "ecb.europa.eu");
}

export function billingWork(b: RunBuilder, plan: RunPlan, root: boolean, supplierId?: string): void {
    const supplier = SUPPLIERS.find((s) => s.id === supplierId) ?? pick(b.rng, SUPPLIERS.slice(1));
    const invoice = pick(b.rng, supplier.invoices);
    if (root) {
        b.model("billing", {
            input: {
                text: `Pay ${supplier.name} (${supplier.id}) invoice ${invoice.id}.`,
                values: [{ value: supplier.id }, { value: invoice.id }],
            },
            calls: ["lookup_supplier"],
        });
    } else {
        b.model("billing", { calls: ["lookup_supplier"] });
    }
    if (chance(b.rng, 0.25)) {
        b.memory("billing", "read", "supplier-notes", supplier.id, {
            label: labelFor("tool:lookup_supplier"),
            summary: `Notes on ${supplier.name}: pays on the 10th`,
        });
    }
    const failed = plan.ending === "failed";
    const looked = b.tool("billing", "lookup_supplier", {
        args: { supplier_id: supplier.id },
        durationMs: failed ? 30_000 : undefined,
        error: failed ? "Timed out after 30 s" : undefined,
        output: {
            summary: `${supplier.name}. IBAN on file ${supplier.iban}. Open invoice ${invoice.id}, ${invoice.amount}`,
            values: [{ value: supplier.iban }, { value: invoice.id }, { value: supplier.email }],
        },
    });
    if (looked.result === "error") {
        b.model("billing", { detail: "Stopped: supplier records did not answer" });
        b.end("failed");
        return;
    }

    const blocked = plan.ending === "blocked" && plan.canAsk;
    if (blocked || chance(b.rng, 0.4)) {
        const folder = blocked ? "/srv/inbox-attachments" : "/srv/invoices";
        b.tool("billing", "get_invoice_pdf", {
            args: { path: `${folder}/${invoice.id}.pdf` },
            output: {
                summary: blocked
                    ? `Invoice ${invoice.id}, ${invoice.amount}. Pay to ${PLANTED.quarantinedIban}`
                    : `Invoice ${invoice.id}, ${invoice.amount}`,
                values: blocked ? [{ value: invoice.id }, { value: PLANTED.quarantinedIban }] : [{ value: invoice.id }],
            },
        });
    }

    if (plan.canAsk && (blocked || chance(b.rng, 0.6))) {
        b.model("billing", { calls: ["pay_invoice"] });
        const paid = b.tool("billing", "pay_invoice", {
            args: {
                iban: blocked ? PLANTED.quarantinedIban : supplier.iban,
                amount: invoice.amount,
                reference: invoice.id,
            },
            fleet: blocked ? { known: false, runs: 6, quarantined: true } : undefined,
            approval: answerFor(b),
        });
        if (paid.result !== "ran") {
            b.model("billing", { detail: "Read the refusal and stopped" });
            b.end("blocked");
            return;
        }
        if (chance(b.rng, 0.15)) b.memory("billing", "write", "supplier-notes", supplier.id);
    } else {
        b.model("billing", { calls: ["send_email"] });
        b.tool("billing", "send_email", {
            args: {
                to: supplier.email,
                subject: `Remittance for ${invoice.id}`,
                body: `${invoice.amount} is in the next payment run.`,
            },
            kinds: { subject: "text", body: "text" },
        });
    }
    b.model("billing", { detail: "Reported back" });
}

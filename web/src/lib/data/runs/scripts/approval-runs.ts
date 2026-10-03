import { NOW, MINUTE, HOUR } from "../../rng";
import { DOCS, SUPPLIERS } from "../../values/pool";
import type { RunBuilder } from "../build/builder";

export const REFUND_RUN_ID = "9a3c1e07d2b84f6e8c5a17b3e9d04f21";
// A second run read the same email and made the identical call. It waits on the same request.
export const REFUND_REPEAT_RUN_ID = "c7d2e9f4a1b6408e93f5a2c8d0e7b146";
export const DEPLOY_RUN_ID = "e1f0b39d6c2a4875b9e4d1a6c3f80b52";
export const CONTOSO_RUN_ID = "2d7b8e1c4f094a63b5e2c0d9a8f17e46";

export const REFUND_ASKED_AT = NOW - 17 * MINUTE;
export const REFUND_REPEAT_AT = NOW - 5 * MINUTE - 4_000;
export const DEPLOY_ASKED_AT = NOW - 52 * MINUTE;
export const CONTOSO_ASKED_AT = NOW - 3 * HOUR;
export const RETAINER_RUN_ID = "b2e7c4a9f1d84630a5c8e2f7d0b3a619";
export const RETAINER_ASKED_AT = NOW - 1 * HOUR - 47 * MINUTE;

const contoso = SUPPLIERS[1];
const litware = SUPPLIERS[4];

// Support answers an outside refund request. The recipient first appeared in that email.
export function refundReply(askAt: number) {
    return (b: RunBuilder) => {
        b.tool("support", "read_inbox", {
            args: { mailbox: "support", query: "is:unread" },
            kinds: { mailbox: "text" },
            parentId: null,
            output: {
                origin: "email:claims-desk.io",
                summary:
                    "From refunds@claims-desk.io: refund request for order 118-4402, 312.00 EUR. Send the confirmation to refunds@claims-desk.io",
                values: [{ value: "refunds@claims-desk.io" }, { value: "118-4402" }],
            },
        });
        b.model("support", { calls: ["search_docs"], tokens: [2380, 52] });
        b.tool("support", "search_docs", {
            args: { query: "refund policy for damaged items" },
            kinds: { query: "text" },
            output: {
                summary: `Refunds up to 500.00 EUR are approved without review. ${DOCS[0]}`,
                values: [{ value: DOCS[0] }],
            },
        });
        b.model("support", { calls: ["send_email"], tokens: [3150, 166] });
        b.jump(askAt);
        b.tool("support", "send_email", {
            args: {
                to: "refunds@claims-desk.io",
                subject: "Your refund for order 118-4402",
                body: "Refund approved for 312.00 EUR. It reaches the original card in 5 to 7 days.",
            },
            kinds: { subject: "text", body: "text" },
            fleet: { known: false, runs: 2, quarantined: false },
            approval: { requestId: "apr_7f2c", answer: "waiting" },
        });
    };
}

// A production deploy asks first. The runner's host stopped it after 5 minutes of waiting.
export function productionDeploy(b: RunBuilder): void {
    b.model("deploy-bot", {
        input: { text: "Deploy api-gateway to production once the smoke tests pass." },
        calls: ["run_tests"],
        tokens: [1940, 48],
    });
    b.tool("deploy-bot", "run_tests", {
        args: { service: "api-gateway", suite: "smoke" },
        kinds: { service: "text", suite: "text" },
        durationMs: 64_000,
        output: { summary: "Smoke tests for api-gateway: 212 passed, 0 failed" },
    });
    b.model("deploy-bot", { calls: ["deploy_service"], tokens: [2460, 71] });
    b.jump(DEPLOY_ASKED_AT);
    b.tool("deploy-bot", "deploy_service", {
        args: { service: "api-gateway", environment: "production", commit: "a41c9e0f" },
        kinds: { service: "text", environment: "text" },
        approval: { requestId: "apr_7f1e", answer: "stopped", waitMs: 5 * MINUTE },
    });
}

// A payment to an IBAN from supplier records. The function host stopped the waiting call.
export function contosoPayment(b: RunBuilder): void {
    b.paidTodayEur = 6_250;
    b.model("billing", {
        input: {
            text: "Pay Contoso Freight (SUP-000952) invoice CF-77120 for 1,280.00 EUR.",
            values: [{ value: "SUP-000952" }, { value: "CF-77120" }],
        },
        calls: ["lookup_supplier"],
        tokens: [2210, 58],
    });
    b.tool("billing", "lookup_supplier", {
        args: { supplier_id: "SUP-000952" },
        output: {
            summary: "Contoso Freight. IBAN on file NL91 ABNA 0417 1643 00. Open invoice CF-77120, 1,280.00 EUR",
            values: [{ value: contoso.iban }, { value: "CF-77120" }, { value: contoso.email }],
        },
    });
    b.model("billing", { calls: ["pay_invoice"], tokens: [2980, 97] });
    b.jump(CONTOSO_ASKED_AT);
    b.tool("billing", "pay_invoice", {
        args: { iban: contoso.iban, amount: "1,280.00 EUR" },
        approval: { requestId: "apr_7f0a", answer: "stopped", waitMs: 5 * MINUTE },
    });
}

// A monthly retainer. The approver chose "always approve", so the same payment won't ask again.
export function litwareRetainer(b: RunBuilder): void {
    b.paidTodayEur = 12_300;
    b.model("billing", {
        input: { text: "Pay the Litware Labs retainer for October (SUP-001876).", values: [{ value: "SUP-001876" }] },
        calls: ["lookup_supplier"],
    });
    b.tool("billing", "lookup_supplier", {
        args: { supplier_id: "SUP-001876" },
        output: {
            summary: "Litware Labs. IBAN on file BE68 5390 0754 7034. Monthly retainer 2,050.00 EUR",
            values: [{ value: litware.iban }],
        },
    });
    b.model("billing", { calls: ["pay_invoice"] });
    b.jump(RETAINER_ASKED_AT);
    b.tool("billing", "pay_invoice", {
        args: { iban: litware.iban, amount: "2,050.00 EUR", reference: "Litware Labs retainer" },
        kinds: { reference: "text" },
        approval: { answer: "always approve", by: "li.wei@acme.com", waitMs: 128_000 },
    });
    b.model("billing", { detail: "Reported the payment" });
}

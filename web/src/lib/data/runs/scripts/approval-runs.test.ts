// @vitest-environment node
import { describe, expect, it } from "vitest";
import { HOUR, MINUTE, NOW } from "../../rng";
import { approvalOf, buildPinned, callsTo, guardsOf } from "../../../../../test/data-scripts-paths/build";
import {
    CONTOSO_ASKED_AT,
    CONTOSO_RUN_ID,
    DEPLOY_ASKED_AT,
    DEPLOY_RUN_ID,
    litwareRetainer,
    REFUND_ASKED_AT,
    REFUND_REPEAT_AT,
    REFUND_REPEAT_RUN_ID,
    REFUND_RUN_ID,
    RETAINER_ASKED_AT,
} from "./approval-runs";

describe("the approval times", () => {
    it("are fixed offsets before now", () => {
        expect(REFUND_ASKED_AT).toBe(NOW - 17 * MINUTE);
        expect(REFUND_REPEAT_AT).toBe(NOW - 5 * MINUTE - 4_000);
        expect(DEPLOY_ASKED_AT).toBe(NOW - 52 * MINUTE);
        expect(CONTOSO_ASKED_AT).toBe(NOW - 3 * HOUR);
        expect(RETAINER_ASKED_AT).toBe(NOW - HOUR - 47 * MINUTE);
    });
});

describe("refundReply", () => {
    it.each([
        ["the first run", REFUND_RUN_ID, REFUND_ASKED_AT],
        ["the repeat run", REFUND_REPEAT_RUN_ID, REFUND_REPEAT_AT],
    ])("makes %s ask at its own time and wait on apr_7f2c", (_, id, askAt) => {
        const run = buildPinned(id);
        const [send] = callsTo(run, "send_email");
        expect(send.startedAt).toBe(askAt);
        expect(send.status).toBe("waiting");
        expect(approvalOf(run, send)?.approval).toMatchObject({ requestId: "apr_7f2c", state: "waiting" });
        expect(run.detail.summary.status).toBe("waiting");
    });

    it("asks because the recipient first appeared in the outside email", () => {
        const run = buildPinned(REFUND_RUN_ID);
        const [send] = callsTo(run, "send_email");
        const egress = guardsOf(run, send).find((step) => step.guard?.guard === "egress");
        expect(egress?.guard?.outcome).toBe("ask");
        expect(egress?.detail).toContain("Recipient first appeared in outside email (claims-desk.io)");
        expect(send.detail).toBe("To r…@claims-desk.io");
    });

    it("gives both runs the same arguments, so they hash the same", () => {
        const hashOf = (id: string) => {
            const run = buildPinned(id);
            return approvalOf(run, callsTo(run, "send_email")[0])?.approval?.argsHash;
        };
        expect(hashOf(REFUND_RUN_ID)).toBe(hashOf(REFUND_REPEAT_RUN_ID));
    });
});

describe("productionDeploy", () => {
    it("runs the smoke tests before it asks to deploy", () => {
        const run = buildPinned(DEPLOY_RUN_ID);
        const [tests] = callsTo(run, "run_tests");
        const [deploy] = callsTo(run, "deploy_service");
        expect(tests.status).toBe("ok");
        expect(tests.output?.summary).toBe("Smoke tests for api-gateway: 212 passed, 0 failed");
        expect(deploy.startedAt).toBe(DEPLOY_ASKED_AT);
    });

    it("fails when the host stops the process that waited for approval", () => {
        const run = buildPinned(DEPLOY_RUN_ID);
        const [deploy] = callsTo(run, "deploy_service");
        expect(deploy.status).toBe("error");
        expect(deploy.error).toBe("The host stopped the process while it waited for approval");
        expect(approvalOf(run, deploy)?.approval).toMatchObject({ requestId: "apr_7f1e", state: "no longer waiting" });
        expect(approvalOf(run, deploy)?.durationMs).toBe(5 * MINUTE);
        expect(run.detail.summary.status).toBe("failed");
    });
});

describe("contosoPayment", () => {
    it("pays an IBAN that comes from supplier records", () => {
        const run = buildPinned(CONTOSO_RUN_ID);
        const [pay] = callsTo(run, "pay_invoice");
        const source = guardsOf(run, pay).find((step) => step.name === "pay_invoice.iban-source");
        expect(source?.guard?.outcome).toBe("allow");
        expect(source?.detail).toBe("The IBAN comes from supplier records");
    });

    it("leaves request apr_7f0a open after the host stopped the wait", () => {
        const run = buildPinned(CONTOSO_RUN_ID);
        const [pay] = callsTo(run, "pay_invoice");
        expect(pay.startedAt).toBe(CONTOSO_ASKED_AT);
        expect(approvalOf(run, pay)?.approval?.state).toBe("no longer waiting");
        expect(approvalOf(run, pay)?.detail).toContain("The request stays open");
        expect(run.detail.summary.status).toBe("failed");
    });
});

describe("litwareRetainer", () => {
    it("is always approved by li.wei and then completes", () => {
        const run = buildPinned(litwareRetainer);
        const [pay] = callsTo(run, "pay_invoice");
        const ask = approvalOf(run, pay);
        expect(pay.status).toBe("ok");
        expect(ask?.approval).toMatchObject({ state: "always approved", by: "li.wei@acme.com" });
        expect(ask?.detail).toBe("Always approved by li.wei@acme.com");
        expect(ask?.durationMs).toBe(128_000);
        expect(run.built.approvals.map((item) => item.answer)).toEqual(["always approve"]);
        expect(run.detail.summary.status).toBe("completed");
    });

    it("asks at the retainer's time and ends with a report", () => {
        const run = buildPinned(litwareRetainer);
        expect(callsTo(run, "pay_invoice")[0].startedAt).toBe(RETAINER_ASKED_AT);
        expect(run.detail.steps.at(-1)?.detail).toBe("Reported the payment");
    });
});

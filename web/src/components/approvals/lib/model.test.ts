// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NOW } from "../../../../test/time";
import {
    CONTOSO,
    DEPLOY,
    EMAIL,
    PAY,
    guardDecision,
    openRequest,
    openRequests,
} from "../../../../test/approvals-overview/fixtures";
import {
    ANSWER_CODE,
    ANSWER_WORD,
    answerMessage,
    argsLine,
    checkWord,
    decisionOf,
    grantOf,
    orderOpen,
    passedCheck,
} from "./model";

describe("orderOpen", () => {
    it("puts live requests first, longest wait on top, without changing the input", () => {
        const items = openRequests();
        const ordered = orderOpen(items);
        expect(ordered.map((item) => item.request.id)).toEqual([EMAIL, PAY, CONTOSO, DEPLOY]);
        expect(items[0].request.id).toBe(PAY);
    });
});

describe("ANSWER_CODE", () => {
    it("names each answer the way the server stores it", () => {
        expect(ANSWER_CODE).toEqual({ "approve once": "once", "always approve": "always", deny: "deny" });
    });
});

describe("decisionOf", () => {
    it("keeps only the hash and the masked values, answered by the given person", () => {
        const item = openRequest(PAY);
        expect(decisionOf(item, "deny", NOW, "dana@acme.com")).toEqual({
            requestId: PAY,
            runId: item.request.runId,
            stepId: item.request.stepId,
            agent: "billing",
            tool: "pay_invoice",
            answer: "deny",
            by: "dana@acme.com",
            openedAt: item.request.openedAt,
            decidedAt: NOW,
            argsHash: item.argsHash,
            args: [
                { name: "iban", value: "DE89…3000" },
                { name: "amount", value: "4950" },
                { name: "reference", value: "INV-20931" },
            ],
        });
    });
});

describe("grantOf", () => {
    it("binds a new unused grant to the agent, tool and argument hash, under a stand-in id", () => {
        const item = openRequest(EMAIL);
        expect(grantOf(item, NOW, "@dana-k")).toEqual({
            id: `pending-${EMAIL}`,
            agent: "support",
            tool: "send_email",
            argsHash: "5b81e84b68786266fd976df1eee2d3aa",
            args: [
                { name: "to", value: "r…@claims-desk.io" },
                { name: "subject", value: "Your refund for order 118-4402" },
            ],
            approvedBy: "@dana-k",
            approvedAt: NOW,
            timesUsed: 0,
            lastUsedAt: null,
            revokedAt: null,
            revokedBy: null,
        });
    });
});

describe("answer words", () => {
    it("names each answer for the decisions table", () => {
        expect(ANSWER_WORD).toEqual({
            "approve once": "Approved once",
            "always approve": "Always approved",
            deny: "Denied",
        });
    });

    it("says what each answer did to the call", () => {
        expect(answerMessage("deny", "pay_invoice")).toBe("Denied pay_invoice. The call returns a refusal");
        expect(answerMessage("always approve", "pay_invoice")).toBe(
            "Always approved pay_invoice for these exact arguments",
        );
        expect(answerMessage("approve once", "pay_invoice")).toBe("Approved pay_invoice once");
    });
});

describe("checkWord", () => {
    it("shows an ask as a warning that waits for a human", () => {
        expect(checkWord(guardDecision({ outcome: "ask", mode: null }))).toEqual({
            word: "Asks a human",
            tone: "warning",
        });
    });

    it("shows an observe-mode block as a warning, since the call ran anyway", () => {
        expect(checkWord(guardDecision({ outcome: "block", mode: "observe" }))).toEqual({
            word: "Would block",
            tone: "warning",
        });
    });

    it("shows allow and pass both as allowed", () => {
        expect(checkWord(guardDecision({ outcome: "allow" }))).toEqual({ word: "Allowed", tone: "context" });
        expect(checkWord(guardDecision({ outcome: "pass" }))).toEqual({ word: "Allowed", tone: "context" });
    });

    it("shows an enforced block as danger", () => {
        expect(checkWord(guardDecision({ outcome: "block", mode: "block" }))).toEqual({
            word: "Blocked",
            tone: "danger",
        });
    });

    it("shows a strip or a flag in past tense as a warning", () => {
        expect(checkWord(guardDecision({ outcome: "strip" }))).toEqual({ word: "Stripped", tone: "warning" });
        expect(checkWord(guardDecision({ outcome: "flag" }))).toEqual({ word: "Flagged", tone: "warning" });
    });

    it("says what an observe-mode strip, flag or ask would have done", () => {
        const observe = { mode: "observe" as const };
        expect(checkWord(guardDecision({ outcome: "strip", ...observe }))).toEqual({
            word: "Would strip",
            tone: "warning",
        });
        expect(checkWord(guardDecision({ outcome: "flag", ...observe }))).toEqual({
            word: "Would flag",
            tone: "warning",
        });
        expect(checkWord(guardDecision({ outcome: "ask", ...observe }))).toEqual({
            word: "Would ask",
            tone: "warning",
        });
    });
});

describe("passedCheck", () => {
    it("folds away only the checks that let the call through", () => {
        expect(passedCheck(guardDecision({ outcome: "allow" }))).toBe(true);
        expect(passedCheck(guardDecision({ outcome: "pass" }))).toBe(true);
        expect(passedCheck(guardDecision({ outcome: "ask" }))).toBe(false);
        expect(passedCheck(guardDecision({ outcome: "block", mode: "observe" }))).toBe(false);
    });
});

describe("argsLine", () => {
    it("joins name=value pairs with two spaces", () => {
        expect(
            argsLine([
                { name: "service", value: "docs-site" },
                { name: "ref", value: "main" },
            ]),
        ).toBe("service=docs-site  ref=main");
        expect(argsLine([])).toBe("");
    });
});

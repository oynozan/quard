// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RUN, T2, at } from "../../../../../test/runs-fixture";
import { HASH, REQUEST, decidedItem, grantItem } from "../../../../../test/approvals-overview/items";
import { decisionOf, grantOf } from "./history";

describe("decisionOf", () => {
    it("keeps the answer, who gave it, the hash and the masked arguments", () => {
        expect(decisionOf(decidedItem())).toEqual({
            requestId: REQUEST,
            runId: RUN,
            stepId: T2,
            agent: "billing",
            tool: "payInvoice",
            answer: "approve once",
            by: "dana@acme.com",
            openedAt: at(6).getTime(),
            decidedAt: at(30).getTime(),
            argsHash: HASH,
            args: [
                { name: "iban", value: "GB33…5555" },
                { name: "amount", value: "4950" },
                { name: "memo", value: "Invoice 114" },
            ],
        });
    });

    it("words every answer, and says unknown when nobody is recorded", () => {
        expect(decisionOf(decidedItem({ answer: "always" })).answer).toBe("always approve");
        expect(decisionOf(decidedItem({ answer: "deny", decidedBy: null }))).toMatchObject({
            answer: "deny",
            by: "unknown",
        });
        expect(decisionOf(decidedItem({ masked: null })).args).toEqual([]);
    });
});

describe("grantOf", () => {
    it("keeps the grant's binding, its masked arguments and its use", () => {
        expect(grantOf(grantItem())).toEqual({
            id: "grt_0123456789abcdef",
            agent: "billing",
            tool: "payInvoice",
            argsHash: HASH,
            args: [
                { name: "iban", value: "GB33…5555" },
                { name: "amount", value: "4950" },
            ],
            approvedBy: "@dana-k",
            approvedAt: at(30).getTime(),
            timesUsed: 3,
            lastUsedAt: at(90).getTime(),
            revokedAt: null,
            revokedBy: null,
        });
    });

    it("says when and by whom a grant was revoked, and that an unused one never ran", () => {
        const revoked = grantOf(grantItem({ lastUsedAt: null, revokedAt: at(120), revokedBy: "dana@acme.com" }));
        expect(revoked).toMatchObject({ lastUsedAt: null, revokedAt: at(120).getTime(), revokedBy: "dana@acme.com" });
    });
});

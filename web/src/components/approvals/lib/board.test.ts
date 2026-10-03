// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NOW } from "../../../../test/time";
import { CONTOSO, DEPLOY, EMAIL, PAY, openRequest } from "../../../../test/approvals-overview/fixtures";
import { LITWARE, REVOKED, approvalsData } from "../../../../test/approvals-overview/history";
import { applyChange, boardOf } from "./board";
import { decisionOf, grantOf } from "./model";

const BY = "dana@acme.com";

describe("boardOf", () => {
    it("shows the server's lists, live requests first, with nothing pending", () => {
        const data = approvalsData();
        const view = boardOf(data);
        expect(view.open.map((item) => item.request.id)).toEqual([EMAIL, PAY, CONTOSO, DEPLOY]);
        expect(view.grants).toBe(data.grants);
        expect(view.decisions).toBe(data.decisions);
        expect(view.fresh).toEqual([]);
    });
});

describe("applyChange", () => {
    it("moves an answered request to the decisions, marked as fresh", () => {
        const item = openRequest(PAY);
        const before = boardOf(approvalsData());
        const view = applyChange(before, { kind: "answer", item, answer: "approve once", at: NOW, by: BY });
        expect(view.open.map((entry) => entry.request.id)).toEqual([EMAIL, CONTOSO, DEPLOY]);
        expect(view.decisions[0]).toEqual(decisionOf(item, "approve once", NOW, BY));
        expect(view.decisions).toHaveLength(before.decisions.length + 1);
        expect(view.grants).toBe(before.grants);
        expect(view.fresh).toEqual([PAY]);
    });

    it("adds a standing grant for always approve", () => {
        const item = openRequest(EMAIL);
        const before = boardOf(approvalsData());
        const view = applyChange(before, { kind: "answer", item, answer: "always approve", at: NOW, by: BY });
        expect(view.grants[0]).toEqual(grantOf(item, NOW, BY));
        expect(view.grants).toHaveLength(before.grants.length + 1);
    });

    it("keeps the server's lists once they hold the answer", () => {
        const item = openRequest(EMAIL);
        const saved = {
            ...boardOf(approvalsData()),
            open: [],
            decisions: [decisionOf(item, "always approve", NOW - 1, "li.wei@acme.com")],
            grants: [{ ...grantOf(item, NOW - 1, "li.wei@acme.com"), id: "grt_aaaaaaaaaaaaaaaa" }],
        };
        const view = applyChange(saved, { kind: "answer", item, answer: "always approve", at: NOW, by: BY });
        expect(view.decisions).toBe(saved.decisions);
        expect(view.grants).toBe(saved.grants);
        expect(view.fresh).toEqual([]);
    });

    it("still adds a grant when the only one for the call is revoked, or is for other arguments", () => {
        const item = openRequest(EMAIL);
        const old = { ...grantOf(item, NOW - 1, BY), id: "grt_bbbbbbbbbbbbbbbb", revokedAt: NOW - 1, revokedBy: BY };
        const other = { ...grantOf(item, NOW - 1, BY), id: "grt_cccccccccccccccc", argsHash: "0".repeat(32) };
        const before = { ...boardOf(approvalsData()), grants: [old, other] };
        const view = applyChange(before, { kind: "answer", item, answer: "always approve", at: NOW, by: BY });
        expect(view.grants.map((grant) => grant.id)).toEqual([`pending-${EMAIL}`, old.id, other.id]);
    });

    it("revokes an active grant, signed by the person, and leaves revoked ones as they were", () => {
        const before = boardOf(approvalsData());
        const litware = before.grants.find((grant) => grant.id === LITWARE)!;
        const revoked = before.grants.find((grant) => grant.id === REVOKED)!;
        const view = applyChange(before, { kind: "revoke", grant: litware, at: NOW, by: BY });
        expect(view.grants.find((grant) => grant.id === LITWARE)).toMatchObject({ revokedAt: NOW, revokedBy: BY });
        const again = applyChange(view, { kind: "revoke", grant: revoked, at: NOW, by: BY });
        expect(again.grants.find((grant) => grant.id === REVOKED)).toEqual(revoked);
        expect(again.open).toBe(before.open);
    });
});

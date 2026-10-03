// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DAY, HOUR, MINUTE, NOW } from "../rng";
import { catalogRuns } from "../runs/catalog";
import { argsHash } from "../values/hash";
import { alwaysGrants, recentDecisions } from "./history";

const grant = (id: string) => alwaysGrants().find((item) => item.id === id)!;

describe("alwaysGrants", () => {
    it("lists grants newest first", () => {
        const times = alwaysGrants().map((item) => item.approvedAt);

        expect(alwaysGrants()).toHaveLength(6);
        expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it("binds each grant to the hash of its agent, tool and exact arguments", () => {
        expect(grant("grant_3e1c").argsHash).toBe(
            argsHash("deploy-bot", "deploy_service", [
                { name: "service", value: "docs-site" },
                { name: "environment", value: "production" },
                { name: "ref", value: "main" },
            ]),
        );
    });

    it("masks sensitive argument values", () => {
        expect(grant("grant_e5a2").args).toEqual([
            { name: "iban", value: "BE68…7034" },
            { name: "amount", value: "2,050.00 EUR" },
            { name: "reference", value: "Litware Labs retainer" },
        ]);
    });

    it("takes the time and approver from the answer given in a listed run", () => {
        const given = catalogRuns()
            .flatMap((run) => run.built.approvals)
            .find((answer) => answer.answer === "always approve" && answer.argsHash === grant("grant_e5a2").argsHash)!;

        expect(given).toBeTruthy();
        expect(grant("grant_e5a2")).toMatchObject({ approvedBy: given.by, approvedAt: given.decidedAt });
        expect(grant("grant_e5a2").approvedAt).not.toBe(NOW - HOUR - 45 * MINUTE);
    });

    it("keeps the recorded approval when no listed run gave it", () => {
        expect(grant("grant_c260")).toMatchObject({ approvedBy: "dana@acme.com", approvedAt: NOW - 27 * DAY });
    });

    it("adds uses in listed runs to older uses and moves the last use forward", () => {
        const uses = catalogRuns()
            .flatMap((run) => run.detail.steps)
            .filter((step) => step.guard?.reason.includes("always-approve grant grant_3e1c"))
            .map((step) => step.startedAt);

        expect(uses.length).toBeGreaterThan(1);
        expect(grant("grant_3e1c")).toMatchObject({ timesUsed: 37 + uses.length, lastUsedAt: Math.max(...uses) });
        expect(Math.max(...uses)).toBeGreaterThan(NOW - DAY - 6 * HOUR);
    });

    it("keeps older use counts when no listed run used the grant", () => {
        expect(grant("grant_c260")).toMatchObject({ timesUsed: 4, lastUsedAt: NOW - 9 * DAY });
        expect(grant("grant_e5a2")).toMatchObject({ timesUsed: 0, lastUsedAt: null });
    });

    it("shows who revoked a grant and when", () => {
        expect(grant("grant_77b2")).toMatchObject({ revokedAt: NOW - 11 * DAY, revokedBy: "dana@acme.com" });
        expect(grant("grant_3e1c")).toMatchObject({ revokedAt: null, revokedBy: null });
    });
});

describe("recentDecisions", () => {
    it("lists the 40 newest answers by default, newest first", () => {
        const decisions = recentDecisions();
        const times = decisions.map((item) => item.decidedAt);

        expect(decisions).toHaveLength(40);
        expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it("stops at the limit it is given", () => {
        expect(recentDecisions(3)).toEqual(recentDecisions().slice(0, 3));
    });

    it("keeps only the hash and masked arguments of each answer", () => {
        const newest = catalogRuns()
            .flatMap((run) => run.built.approvals)
            .sort((a, b) => b.decidedAt - a.decidedAt)[0];

        expect(recentDecisions(1)).toEqual([
            {
                requestId: newest.requestId,
                runId: newest.runId,
                stepId: newest.stepId,
                agent: newest.agent,
                tool: newest.tool,
                answer: newest.answer,
                by: newest.by,
                openedAt: newest.openedAt,
                decidedAt: newest.decidedAt,
                argsHash: newest.argsHash,
                args: newest.args,
            },
        ]);
        expect(recentDecisions(1)[0].args.find((arg) => arg.name === "iban")?.value).toBe("ES91…1332");
    });
});

// @vitest-environment node
import type { IncidentCategory, StoredVerdict } from "@quard/db";
import { describe, expect, it } from "vitest";
import { incidentRow, pendingRow, storedVerdict } from "../../../../../test/incidents/rows";
import { at, RUN } from "../../../../../test/runs-fixture";
import { agentIncidentOf, incidentOf } from "./incident";

describe("incidentOf", () => {
    it("titles a found incident from its stored fields", () => {
        expect(incidentOf(incidentRow())).toEqual({
            id: "inc_0123456789abcdef",
            runId: RUN,
            title: "payInvoice with input from acme-billing.net",
            category: "bad input",
            entryPoint: "web:acme-billing.net",
            damage: "payInvoice was blocked",
            entryAgent: "billing",
            damageAgent: "billing",
            replay: "not started",
            openedAt: at(6).getTime(),
        });
    });

    it("gives every category its own title, and says when the call ran", () => {
        const titleOf = (fields: Parameters<typeof storedVerdict>[0]) =>
            incidentOf(incidentRow({ verdict: storedVerdict(fields) })).title;
        const tool = { stepId: "t", agent: "billing", at: "", tool: "payInvoice", ran: true };
        expect(titleOf({ category: "bad reasoning" })).toBe("billing asked for payInvoice on its own");
        expect(titleOf({ category: "bad handoff" })).toBe("payInvoice after a handoff from acme-billing.net");
        expect(titleOf({ category: "missing guard" })).toBe("payInvoice with no guard to stop it");
        const broken = storedVerdict({ category: "broken tool", damage: tool });
        const row = incidentRow({ verdict: { ...broken, entry: { ...broken.entry, origin: "tool:fetchPage" } } });
        expect(incidentOf(row)).toMatchObject({ title: "payInvoice after fetchPage failed", damage: "payInvoice ran" });
    });

    it("says when a guard flagged content, or a run limit stopped a model call, whatever the category", () => {
        const of = (fields: Partial<StoredVerdict["damage"]>, category: IncidentCategory = "bad input") => {
            const verdict = storedVerdict({ category });
            return incidentOf(incidentRow({ verdict: { ...verdict, damage: { ...verdict.damage, ...fields } } }));
        };
        expect(of({ tool: "fetchPage", ran: true, kind: "detection" })).toMatchObject({
            title: "fetchPage returned flagged content from acme-billing.net",
            damage: "Content from fetchPage was flagged",
        });
        const stopped = { tool: "gpt-5.4-mini", ran: false, kind: "limit" } as const;
        expect(of(stopped, "bad reasoning")).toMatchObject({
            title: "A run limit stopped gpt-5.4-mini",
            damage: "A run limit stopped gpt-5.4-mini",
        });
        expect(of({ ...stopped, ran: true }, "missing guard").title).toBe("gpt-5.4-mini went over a run limit");
    });

    it("says the finder is at work, or that it failed, before a verdict", () => {
        expect(incidentOf(pendingRow())).toMatchObject({
            title: "Finding the root cause",
            category: null,
            entryPoint: null,
            damage: null,
            entryAgent: null,
            damageAgent: null,
            replay: "not started",
        });
        expect(incidentOf(pendingRow({ findState: "failed" })).title).toBe("Root cause not found");
    });
});

describe("agentIncidentOf", () => {
    it("names the parts the agent played", () => {
        const row = incidentRow({ entryAgent: "researcher", turningAgent: "billing", damageAgent: "billing" });
        expect(agentIncidentOf(row, "billing")).toEqual({
            id: row.id,
            title: "payInvoice with input from acme-billing.net",
            roles: ["turning", "damage"],
            openedAt: at(6).getTime(),
        });
        expect(agentIncidentOf(row, "researcher").roles).toEqual(["entry"]);
    });
});

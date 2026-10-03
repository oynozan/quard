// @vitest-environment node
import { describe, expect, it } from "vitest";
import { forwardHistory, searchedAddress, tenfoldAmount, wrongInvoice } from "../runs/scripts/archive-runs";
import { unguardedExport } from "../runs/scripts/incident-runs";
import { STORY_RUN_ID } from "../runs/scripts/story";
import { buildPinned, marked } from "../../../../test/data-scripts-paths/build";
import { incidentPath } from "./build";
import type { PathNode } from "../types";

const brief = (nodes: PathNode[]) => nodes.map((node) => [node.role, node.kind, node.title]);

describe("incidentPath", () => {
    it("names the entry point, the agent that read it, the carrier, the turning point and the damage", () => {
        const run = buildPinned(STORY_RUN_ID);
        const path = incidentPath(run.detail, run.built.marks);
        expect(brief(path)).toEqual([
            ["entry", "origin", "supplier-portal.example"],
            [null, "agent", "researcher"],
            ["carry", "handoff", "researcher to billing"],
            ["turning", "agent", "billing"],
            ["damage", "call", "pay_invoice"],
        ]);
        expect(path[0].label.origin).toBe("web:supplier-portal.example");
    });

    it("keeps time order whatever order the marks came in", () => {
        const run = buildPinned(STORY_RUN_ID);
        const reversed = [...run.built.marks].reverse();
        expect(brief(incidentPath(run.detail, reversed))).toEqual(brief(incidentPath(run.detail, run.built.marks)));
    });

    it("skips the reader when the same agent then took the turn", () => {
        const run = buildPinned(forwardHistory);
        expect(brief(incidentPath(run.detail, run.built.marks))).toEqual([
            ["entry", "origin", "gmail.com"],
            ["turning", "agent", "support"],
            ["damage", "call", "send_email"],
        ]);
    });

    it("does not repeat a reader that is already marked", () => {
        const run = buildPinned(unguardedExport);
        expect(brief(incidentPath(run.detail, run.built.marks))).toEqual([
            ["entry", "origin", "docs.acme.internal"],
            ["turning", "agent", "support"],
            ["damage", "call", "export_contacts"],
        ]);
    });

    it("has no reader when no later model call read the search results", () => {
        const run = buildPinned(searchedAddress);
        expect(brief(incidentPath(run.detail, run.built.marks))).toEqual([
            ["entry", "origin", "Hosted web search"],
            ["carry", "handoff", "researcher to billing"],
            ["turning", "agent", "billing"],
            ["damage", "call", "send_email"],
        ]);
    });

    it("shows a handoff marked as entry and carrier once, as the entry", () => {
        const run = buildPinned(wrongInvoice);
        const path = incidentPath(run.detail, run.built.marks);
        expect(brief(path)).toEqual([
            ["entry", "handoff", "researcher to billing"],
            ["turning", "agent", "billing"],
            ["damage", "call", "pay_invoice"],
        ]);
    });

    it("labels a model call that is both entry and turning point as the agent itself", () => {
        const run = buildPinned(tenfoldAmount);
        const path = incidentPath(run.detail, run.built.marks);
        expect(brief(path)).toEqual([
            ["entry", "agent", "billing"],
            ["damage", "call", "pay_invoice"],
        ]);
        expect(path[0].label.origin).toBe("agent:billing");
    });

    it("prefers damage over other roles on the same step", () => {
        const run = buildPinned(STORY_RUN_ID);
        const pay = marked(run, "damage");
        const path = incidentPath(run.detail, [
            { role: "carry", stepId: pay.id },
            { role: "damage", stepId: pay.id },
        ]);
        expect(brief(path)).toEqual([["damage", "call", "pay_invoice"]]);
    });

    it("still shows the reader when no turning point is marked", () => {
        const run = buildPinned(forwardHistory);
        const marks = run.built.marks.filter((mark) => mark.role !== "turning");
        expect(brief(incidentPath(run.detail, marks))).toEqual([
            ["entry", "origin", "gmail.com"],
            [null, "agent", "support"],
            ["damage", "call", "send_email"],
        ]);
    });

    it("is empty without marks", () => {
        expect(incidentPath(buildPinned(STORY_RUN_ID).detail, [])).toEqual([]);
    });
});

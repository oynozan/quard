// @vitest-environment node
import type { StoredVerdict } from "@quard/db";
import { describe, expect, it } from "vitest";
import { incidentRow, pendingRow, storedVerdict } from "../../../../../test/incidents/rows";
import { at, M1, M2, RUN, storedRun, T1, T2 } from "../../../../../test/runs-fixture";
import { runDetailOf } from "../../runs/live/detail";
import type { VerdictHandoff } from "../types";
import { incidentDetailOf, incidentPath } from "./detail";

const run = runDetailOf(storedRun(), at(30).getTime());

describe("incidentPath", () => {
    it("runs from the page that came in to the model call that asked and the blocked call", () => {
        const path = incidentPath(run, storedVerdict());
        expect(path.map((node) => [node.role, node.kind, node.title, node.stepId])).toEqual([
            ["entry", "origin", "acme-billing.net", T1],
            ["turning", "agent", "billing", M2],
            ["damage", "call", "payInvoice", T2],
        ]);
        expect(path[0]?.detail).toBe("fetchPage · flag: instructions, invisible_text");
    });

    it("starts at the entry's own step when the run read its origin more than once", () => {
        const page = run.steps.find((step) => step.id === T1)!;
        const twice = { ...run, steps: [...run.steps, { ...page, id: "t3", startedAt: page.startedAt + 1000 }] };
        const verdict = storedVerdict();
        const entryAt = (stepId: string, origin = verdict.entry.origin) =>
            incidentPath(twice, { ...verdict, entry: { ...verdict.entry, stepId, origin } })[0];
        expect(entryAt("t3")).toMatchObject({ role: "entry", kind: "origin", stepId: "t3" });
        // A step that does not hold the origin falls back to the first that does
        expect(entryAt(M2).stepId).toBe(T1);
        // The user's message came in at its own model call
        expect(entryAt(M1, "user")).toMatchObject({ title: "user", detail: "The user's message", stepId: M1 });
        // A tool call holds no user message, and here no model call read it first
        expect(entryAt(T1, "user").detail).toBe(verdict.entry.flags.join(", "));
    });

    it("keeps the stored entry when the run holds no output from it, and leaves out missing steps", () => {
        const verdict = storedVerdict();
        const path = incidentPath(run, {
            ...verdict,
            entry: { ...verdict.entry, origin: "email:inbox", stepId: "s9", flags: ["instructions", "links"] },
            turning: { ...verdict.turning, stepId: "gone" },
            damage: { ...verdict.damage, stepId: "gone" },
        });
        expect(path).toEqual([
            {
                kind: "origin",
                role: "entry",
                title: "inbox",
                detail: "instructions, links",
                agent: "billing",
                runId: RUN,
                stepId: "s9",
                label: { origin: "email:inbox", trust: "untrusted", sensitivity: "public" },
                at: at(3).getTime(),
            },
        ]);
    });
});

describe("incidentPath across agents", () => {
    const handoff: VerdictHandoff = {
        stepId: "h1",
        kind: "handoff",
        from: "research",
        to: "billing",
        at: at(4).toISOString(),
        trust: "untrusted",
        verified: false,
    };
    const across = (fields: Partial<VerdictHandoff> | null) =>
        storedVerdict({
            category: "bad handoff",
            acrossAgents: {
                entryAgent: "research",
                handoff: fields && { ...handoff, ...fields },
                turningAgent: "billing",
                damageAgent: "billing",
            },
        });

    it("puts the handoff that carried the content between the entry and the turning point", () => {
        const path = incidentPath(run, across({}));
        expect(path.map((node) => [node.role, node.kind])).toEqual([
            ["entry", "origin"],
            ["carry", "handoff"],
            ["turning", "agent"],
            ["damage", "call"],
        ]);
        expect(path[1]).toEqual({
            kind: "handoff",
            role: "carry",
            title: "research to billing",
            detail: "Not verified: no label record matched",
            agent: "research",
            runId: RUN,
            stepId: "h1",
            label: { origin: "agent:research", trust: "untrusted", sensitivity: "internal" },
            at: at(4).getTime(),
        });
    });

    it("draws a message or an agent run as a tool as a message", () => {
        const kindOf = (kind: "message" | "tool") => incidentPath(run, across({ kind, verified: true }))[1];
        expect(kindOf("message")).toMatchObject({ kind: "message", detail: "Verified: its label record matched" });
        expect(kindOf("tool").kind).toBe("message");
    });

    it("adds no node when no handoff was found", () => {
        expect(incidentPath(run, across(null))).toHaveLength(3);
    });
});

describe("incidentDetailOf", () => {
    it("holds the verdict, the path, the replay and why there is no note yet", () => {
        const guard = { text: "No rule on payInvoice stopped this call", tool: "payInvoice", guard: null, rule: null };
        const verdict = storedVerdict({ missingGuard: { ...guard, observe: false } });
        const detail = incidentDetailOf(incidentRow({ verdict }), run);
        expect(detail.incident.title).toBe("payInvoice with input from acme-billing.net");
        expect(detail.run).toBe(run.summary);
        expect(detail.findError).toBeNull();
        expect(detail.working).toBe(true);
        expect(detail.findings?.verdict).toEqual({
            category: "bad input",
            missingGuard: { ...guard, observe: false },
            handoffFault: null,
            acrossAgents: null,
            versions: [{ agent: "billing", version: "v3" }],
        });
        expect(detail.findings?.path).toHaveLength(3);
        expect(detail.findings?.replay.status).toBe("not started");
        expect(detail.findings).toMatchObject({ reviewer: null, reviewerStatus: "No explanation yet" });
    });

    it("keeps the handoff fault and the agents of each part", () => {
        const acrossAgents = { entryAgent: "research", handoff: null, turningAgent: "billing", damageAgent: "billing" };
        const verdict = storedVerdict({ category: "bad handoff", handoffFault: "constraint dropped", acrossAgents });
        const detail = incidentDetailOf(incidentRow({ verdict }), run);
        expect(detail.findings?.verdict).toMatchObject({
            category: "bad handoff",
            handoffFault: "constraint dropped",
            acrossAgents,
        });
    });

    it("reads a verdict stored before handoffs were recorded", () => {
        const { acrossAgents, handoffFault, ...old } = storedVerdict();
        expect([acrossAgents, handoffFault]).toEqual([null, null]);
        const detail = incidentDetailOf(incidentRow({ verdict: old as StoredVerdict }), run);
        expect(detail.findings?.verdict).toMatchObject({ handoffFault: null, acrossAgents: null });
        expect(detail.findings?.path).toHaveLength(3);
    });

    it("keeps the AI reviewer's note", () => {
        const reviewer = { model: "gpt-6.1-sol", costUsd: 0.002, writtenAt: at(8).toISOString(), paragraphs: ["Hi."] };
        const detail = incidentDetailOf(incidentRow({ reviewState: "done", reviewer }), run);
        expect(detail.findings).toMatchObject({
            reviewer: { ...reviewer, writtenAt: at(8).getTime() },
            reviewerStatus: "",
        });
        expect(detail.working).toBe(false);
    });

    it("says why there is no note", () => {
        const failed = incidentDetailOf(incidentRow({ reviewState: "failed", reviewer: { error: "HTTP 500" } }), run);
        expect(failed.findings?.reviewerStatus).toBe("The explanation failed: HTTP 500");
        const skipped = incidentDetailOf(incidentRow({ reviewState: "skipped" }), run);
        expect(skipped.findings?.reviewerStatus).toBe("Skipped: the worker has no provider key");
    });

    it("has no findings before the verdict, and works until the finder ends", () => {
        const pending = incidentDetailOf(pendingRow(), run);
        expect(pending).toMatchObject({ findings: null, findError: null, working: true });
        const failed = incidentDetailOf(pendingRow({ findState: "failed", findError: "Never arrived" }), run);
        expect(failed).toMatchObject({ findings: null, findError: "Never arrived", working: false });
    });

    it("works while the replay runs", () => {
        const row = incidentRow({ reviewState: "skipped", replayState: "requested" });
        expect(incidentDetailOf(row, run).working).toBe(true);
    });
});

import type { RunListItem } from "@quard/db";
import { APPROVAL_STALE_MS } from "@quard/shared";
import { describe, expect, it } from "vitest";
import { HOUR } from "@/lib/time";
import { at, BASE, REQUEST, RUN, runWaiter, storedRun, storedWaitingRun } from "../../../../../test/runs-fixture";
import { runDetailOf, runRowOf } from "./detail";
import { decisionCounts, IDLE_MS, statusOf } from "./status";

const LATER = BASE + 60 * 60_000;

function item(fields: Partial<RunListItem> = {}): RunListItem {
    return {
        runId: RUN,
        agent: "billing",
        startedAt: at(0),
        lastEventAt: at(10),
        endedAt: null,
        outcome: null,
        error: null,
        modelCalls: 3,
        toolCalls: 2,
        blocked: 1,
        costUsd: 0.0031,
        costKnown: true,
        influenced: true,
        flagged: true,
        degraded: false,
        agents: ["billing"],
        tools: ["fetchPage", "payInvoice"],
        decisions: { allowed: 2, asked: 0, blocked: 1 },
        lastStep: { kind: "model_call", status: "ok" },
        ...fields,
    };
}

describe("runRowOf", () => {
    it("turns a stored list row into the runs list's row", () => {
        expect(runRowOf(item(), LATER)).toEqual({
            id: RUN,
            rootAgent: "billing",
            agents: ["billing"],
            status: "completed",
            startedAt: BASE,
            durationMs: 10_000,
            steps: 8,
            costUsd: 0.0031,
            costKnown: true,
            decisions: { allowed: 2, asked: 0, blocked: 1 },
            untrusted: true,
            tools: ["fetchPage", "payInvoice"],
            incidentId: null,
            approvalId: null,
        });
    });

    it("uses the recorded outcome and end time over any guess", () => {
        const row = runRowOf(item({ outcome: "blocked", endedAt: at(12) }), BASE + 20_000);

        expect(row).toMatchObject({ status: "blocked", durationMs: 12_000 });
    });

    it("counts a recent run as running, up to now, and names the root agent when no agent is listed", () => {
        const row = runRowOf(item({ agents: [] }), BASE + 20_000);

        expect(row).toMatchObject({ status: "running", durationMs: 20_000, agents: ["billing"] });
    });
});

describe("runDetailOf", () => {
    it("builds the run view: summary, agents with parents, steps and empty extras", () => {
        const detail = runDetailOf(storedRun(), LATER);

        expect(detail.summary).toMatchObject({
            id: RUN,
            status: "failed",
            steps: detail.steps.length,
            costUsd: 0.0062,
            costKnown: false,
            decisions: { allowed: 3, asked: 1, blocked: 1 },
            untrusted: true,
            tools: ["fetchPage", "payInvoice"],
        });
        expect(detail.agents.map((agent) => [agent.name, agent.parent, agent.depth, agent.model])).toEqual([
            ["billing", null, 0, "gpt-5.4-mini"],
            ["researcher", "billing", 1, "gpt-5.4-nano"],
        ]);
        expect(detail.agents.map((agent) => [agent.costUsd, agent.costKnown])).toEqual([
            [0.0031, false],
            [0, false],
        ]);
        expect(detail.graph).toEqual({ nodes: detail.agents, edges: [] });
        expect(detail.limits).toEqual([]);
    });

    it("shows the recorded outcome in the run view", () => {
        const run = { ...storedRun(), outcome: "completed" as const, endedAt: at(11) };

        expect(runDetailOf(run, LATER).summary).toMatchObject({ status: "completed", durationMs: 11_000 });
    });

    it("counts a recent run as running in the run view too", () => {
        const detail = runDetailOf(storedRun(), BASE + 12_000);

        expect(detail.summary).toMatchObject({ status: "running", durationMs: 12_000 });
    });

    it("shows a run that has started but made no calls yet", () => {
        const run = { ...storedRun(), steps: [], labels: [], decisions: [], lastEventAt: at(0) };
        const detail = runDetailOf(run, LATER);

        expect(detail.summary).toMatchObject({ status: "completed", steps: 0, durationMs: 0, untrusted: false });
        expect(detail.agents).toEqual([
            expect.objectContaining({
                name: "billing",
                model: "",
                steps: 0,
                startedAt: 0,
                endedAt: 0,
                influenced: false,
            }),
        ]);
    });

    it("keeps an agent whose first model call points at its own step without a parent", () => {
        const run = storedRun();
        run.steps[3]!.parentStepId = run.steps[3]!.stepId;

        expect(runDetailOf(run, LATER).agents[1]?.parent).toBeNull();
    });
});

describe("statusOf", () => {
    it.each([
        ["running when it was active just now", { kind: "tool_call", status: "error" }, BASE + IDLE_MS - 1, "running"],
        ["failed when the last step failed", { kind: "model_call", status: "error" }, LATER, "failed"],
        ["blocked when the last tool call was blocked", { kind: "tool_call", status: "blocked" }, LATER, "blocked"],
        ["completed otherwise", null, LATER, "completed"],
    ] as const)("is %s", (_, last, now, status) => {
        expect(statusOf(BASE, last, now)).toBe(status);
    });

    it("takes a recorded outcome over the last step and the clock", () => {
        expect(statusOf(BASE, { kind: "tool_call", status: "blocked" }, BASE, "failed")).toBe("failed");
        expect(statusOf(BASE, null, BASE, "completed", true)).toBe("completed");
    });

    it("is waiting while a call waits for a person, however long the run has been quiet", () => {
        expect(statusOf(BASE, { kind: "tool_call", status: "error" }, LATER, null, true)).toBe("waiting");
        expect(statusOf(BASE, null, BASE, null, true)).toBe("waiting");
    });

    it("counts only guard rows in decision counts", () => {
        expect(decisionCounts(runDetailOf(storedRun(), LATER).steps)).toEqual({ allowed: 3, asked: 1, blocked: 1 });
    });
});

describe("runs with a call waiting for a person", () => {
    // Hours after the last event, only the call's beat counts since approvals never expire
    const NOW = LATER + 5 * HOUR;
    const live = runWaiter({ lastBeatAt: new Date(NOW - APPROVAL_STALE_MS) });
    const stopped = runWaiter({ lastBeatAt: new Date(NOW - APPROVAL_STALE_MS - 1) });

    it("shows the run as waiting and still open, linked to its request, while the call beats", () => {
        expect(runRowOf(item(), NOW, [live])).toMatchObject({
            status: "waiting",
            durationMs: NOW - BASE,
            steps: 9,
            approvalId: REQUEST,
        });
        const detail = runDetailOf(storedWaitingRun(), NOW, [live]);
        expect(detail.summary).toMatchObject({
            status: "waiting",
            durationMs: NOW - BASE,
            steps: detail.steps.length,
            approvalId: REQUEST,
        });
        expect(detail.steps.filter((step) => step.approval)).toEqual([
            expect.objectContaining({
                kind: "approval",
                name: "payInvoice",
                status: "waiting",
                approval: expect.objectContaining({ requestId: REQUEST, state: "waiting" }),
            }),
        ]);
    });

    it("judges the run as usual once the call stopped beating, still linked to its open request", () => {
        expect(runRowOf(item(), NOW, [stopped])).toMatchObject({
            status: "completed",
            durationMs: 10_000,
            steps: 8,
            approvalId: REQUEST,
        });
        const detail = runDetailOf(storedWaitingRun(), NOW, [stopped]);
        expect(detail.summary).toMatchObject({ status: "completed", approvalId: REQUEST });
        expect(detail.steps.some((step) => step.approval)).toBe(false);
    });

    it("links the request a call still waits on before one whose call stopped", () => {
        const quiet = runWaiter({ askId: "b".repeat(16), requestId: "apr_fedcba9876543210", lastBeatAt: at(0) });
        expect(runRowOf(item(), NOW, [quiet, live]).approvalId).toBe(REQUEST);
        expect(runDetailOf(storedWaitingRun(), NOW, [quiet, live]).summary.approvalId).toBe(REQUEST);
    });

    it("keeps a recorded end over a call that still waits", () => {
        const row = runRowOf(item({ outcome: "failed", endedAt: at(12) }), NOW, [live]);
        expect(row).toMatchObject({ status: "failed", durationMs: 12_000, approvalId: REQUEST });
    });
});

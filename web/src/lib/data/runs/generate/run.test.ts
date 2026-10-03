// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { runLimit } from "../../guards/limits";
import { calls, firstGenerated, planOf, runId } from "../../../../../test/data-runs-generate/runs";
import { ORCHESTRATOR_TASKS, RESULT } from "./content";
import { generateRun } from "./run";
import { RunBuilder, type BuiltRun } from "../build/builder";
import type { RunPlan } from "./plan";

const find = (ending: RunPlan["ending"], root: string, match: (run: BuiltRun) => boolean) =>
    firstGenerated(ending, { root }, match);

const handoffs = (run: BuiltRun) => run.steps.filter((step) => step.kind === "handoff");
const messages = (run: BuiltRun) => run.steps.filter((step) => step.kind === "message");
const models = (run: BuiltRun, agent: string) =>
    run.steps.filter((step) => step.kind === "model_call" && step.agent === agent);
const twoStep = ORCHESTRATOR_TASKS.filter((task) => task.steps.length === 2);

// Some tests tighten the loop limit or drop a canned result; both are put back after each test.
const loops = runLimit("loops");
const LOOP_LIMIT = loops.limit;
const RESEARCHER_RESULT = RESULT.researcher;
afterEach(() => {
    loops.limit = LOOP_LIMIT;
    RESULT.researcher = RESEARCHER_RESULT;
});

describe("generateRun", () => {
    it("writes the same run for the same plan", () => {
        const plan = planOf("completed", { id: runId(7) });
        expect(generateRun(plan)).toEqual(generateRun(plan));
    });

    it("uses the plan's id and start", () => {
        const plan = planOf("completed", { id: runId(8), root: "support" });
        const run = generateRun(plan);
        expect(run.runId).toBe(runId(8));
        expect(run.startedAt).toBe(plan.startedAt);
    });

    it.each([
        ["support", "read_inbox"],
        ["inbox-triage", "read_inbox"],
        ["billing", "lookup_supplier"],
        ["deploy-bot", "run_tests"],
    ])("starts a %s run with that agent's own work", (root, tool) => {
        const run = generateRun(planOf("completed", { id: runId(3), root }));
        expect(run.steps[0].agent).toBe(root);
        expect(calls(run)[0]).toBe(`${tool}:ok`);
    });

    it("sends the orchestrator's task to helpers and answers the user", () => {
        const run = generateRun(planOf("completed", { id: runId(1) }));
        const first = run.steps[0];
        expect(first.agent).toBe("orchestrator");
        expect(first.detail).toBe("Asked for delegate");
        const briefs = ORCHESTRATOR_TASKS.flatMap((task) => task.steps.map((step) => step.brief));
        expect(handoffs(run).length).toBeGreaterThan(0);
        expect(messages(run)).toHaveLength(handoffs(run).length);
        for (const handoff of handoffs(run)) expect(briefs).toContain(handoff.detail);
        for (const message of messages(run)) {
            expect(message.link?.to).toBe("orchestrator");
            expect(message.detail).toBe(RESULT[message.agent]);
        }
        expect(models(run, "orchestrator").at(-1)?.detail).toBe("Answered the user");
    });

    it("works through both helpers of a two-step task, in order", () => {
        const run = find("completed", "orchestrator", (r) => handoffs(r).length === 2);
        const task = twoStep.find((t) => t.steps[0].brief === handoffs(run)[0].detail)!;
        expect(handoffs(run).map((step) => step.link?.to)).toEqual(task.steps.map((step) => step.agent));
        // Between the helpers the orchestrator asks to delegate again.
        const between = models(run, "orchestrator").filter((step) => step.startedAt > messages(run)[0].startedAt);
        expect(between[0].detail).toBe("Asked for delegate");
    });

    it("pays the supplier named in the billing brief", () => {
        const run = find("completed", "orchestrator", (r) =>
            handoffs(r).some((step) => step.detail.includes("SUP-002190")),
        );
        const lookup = run.steps.find((step) => step.name === "lookup_supplier" && step.kind === "tool_call")!;
        expect(lookup.args[0].value).toBe("SUP-002190");
    });

    it("does not start the second helper after the first one failed", () => {
        const firstBriefs = twoStep.map((task) => task.steps[0].brief);
        const run = find("failed", "orchestrator", (r) => firstBriefs.includes(handoffs(r)[0]?.detail ?? ""));
        expect(run.status).toBe("failed");
        expect(handoffs(run)).toHaveLength(1);
    });

    it("summarizes the helpers' results now and then", () => {
        const run = find("completed", "orchestrator", (r) => calls(r).includes("summarize:ok"));
        const summarize = run.steps.find((step) => step.name === "summarize" && step.kind === "tool_call")!;
        expect(summarize.output?.summary).toBe("A short summary for the user");
        expect(models(run, "orchestrator").at(-1)?.detail).toBe("Answered the user");
    });

    it("stops without a result or an answer once a helper ended the run", () => {
        const run = generateRun(planOf("failed", { id: runId(2) }));
        expect(run.status).toBe("failed");
        expect(messages(run)).toHaveLength(handoffs(run).length - 1);
        for (let n = 1; n <= 40; n++) {
            for (const ending of ["failed", "blocked"] as const) {
                const ended = generateRun(planOf(ending, { id: runId(n) }));
                expect(models(ended, "orchestrator").some((step) => step.detail === "Answered the user")).toBe(false);
                expect(messages(ended)).toHaveLength(handoffs(ended).length - 1);
            }
        }
    });

    it("never summarizes after a helper ended the run", () => {
        for (let n = 1; n <= 40; n++) {
            const run = generateRun(planOf("failed", { id: runId(n) }));
            expect(calls(run)).not.toContain("summarize:ok");
        }
    });

    it("does no helper work when the run limits block the first delegation", () => {
        loops.limit = 1;
        const run = generateRun(planOf("completed", { id: runId(1) }));
        expect(calls(run)[0]).toBe("delegate:blocked");
        expect(handoffs(run)).toHaveLength(0);
        expect(run.steps.every((step) => step.agent === "orchestrator")).toBe(true);
    });

    it("has a helper without a canned result report back Done.", () => {
        delete RESULT.researcher;
        const run = find("completed", "orchestrator", (r) => handoffs(r)[0]?.link?.to === "researcher");
        expect(messages(run)[0].detail).toBe("Done.");
    });
});

describe("every generated run", () => {
    const roots = ["orchestrator", "support", "inbox-triage", "billing", "deploy-bot"];
    const endings = ["completed", "failed", "blocked"] as const;

    it("ends the way its plan says, and writes nothing after it ends", () => {
        // Counts the steps written when the run ends; the builder itself never refuses more.
        let atEnd: number | null = null;
        const end = vi.spyOn(RunBuilder.prototype, "end").mockImplementation(function (this: RunBuilder, status) {
            atEnd ??= this.steps.length;
            this.ending = status;
        });
        try {
            for (const root of roots) {
                for (const ending of endings) {
                    for (const canAsk of [true, false]) {
                        for (let n = 1; n <= 60; n++) {
                            atEnd = null;
                            const run = generateRun(planOf(ending, { id: runId(n), root, canAsk }));
                            expect(run.status, `${root} ${ending} ${canAsk} ${n}`).toBe(ending);
                            expect(atEnd ?? run.steps.length).toBe(run.steps.length);
                        }
                    }
                }
            }
        } finally {
            end.mockRestore();
        }
    });
});

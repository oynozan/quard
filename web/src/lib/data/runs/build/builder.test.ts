// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RUN_ID, START } from "../../../../../test/data-runs-build/state";
import { MINUTE, NOW, SECOND } from "../../rng";
import { RunBuilder } from "./builder";

const IBAN = "GB33BUKB20201555555555";

// A short finished run: a delegation, a lookup, a refund a person approves, and a reply.
function write(b: RunBuilder) {
    b.model("orchestrator", { input: { text: "Refund order ORD-55120" }, calls: ["delegate"] });
    b.delegate("orchestrator", "support", { text: "Refund ORD-55120", values: [{ value: "ORD-55120" }] });
    b.memory("support", "read", "notes", "refunds");
    b.model("support", { calls: ["refund_order"], mark: "turning" });
    b.tool("support", "refund_order", {
        args: { order: "ORD-55120" },
        approval: { answer: "approve once", by: "dana@acme.com", waitMs: 30 * SECOND },
        mark: "damage",
    });
    b.message("support", "orchestrator", { text: "Refunded" }, "carry");
}

describe("RunBuilder.finish for a finished run", () => {
    it("returns every step in time order with its marks, approvals and agent tree", () => {
        const b = new RunBuilder(RUN_ID, START);
        write(b);
        const run = b.finish();
        expect(run.runId).toBe(RUN_ID);
        expect(run.startedAt).toBe(START);
        expect(run.status).toBe("completed");
        expect(run.steps).toHaveLength(b.steps.length);
        const times = run.steps.map((step) => step.startedAt);
        expect(times).toEqual([...times].sort((x, y) => x - y));
        expect(run.marks.map((mark) => mark.role)).toEqual(["turning", "damage", "carry"]);
        expect(run.approvals).toHaveLength(1);
        expect(run.approvals[0]).toMatchObject({ tool: "refund_order", by: "dana@acme.com", runId: RUN_ID });
        expect(run.rawArgs.map((arg) => [arg.tool, arg.name])).toEqual([
            ["delegate", "to"],
            ["delegate", "brief"],
            ["refund_order", "order"],
        ]);
        const handoff = run.steps.find((step) => step.kind === "handoff")!;
        expect(run.index.map((value) => [value.raw, value.stepId])).toEqual([["ORD-55120", handoff.id]]);
        expect(run.parents).toEqual([
            ["support", "orchestrator"],
            ["orchestrator", null],
        ]);
    });

    it("writes the same run every time for the same run id", () => {
        const first = new RunBuilder(RUN_ID, START);
        const second = new RunBuilder(RUN_ID, START);
        write(first);
        write(second);
        expect(second.finish()).toEqual(first.finish());
    });

    it("ends with the status the script sets", () => {
        const b = new RunBuilder(RUN_ID, START);
        b.model("billing", { error: "Model unavailable" });
        b.end("failed");
        expect(b.finish().status).toBe("failed");
    });

    it("orders steps that start together in the order they were written", () => {
        const b = new RunBuilder(RUN_ID, START);
        const late = b.step("billing", "model_call", "late", null, 10, START + 500);
        const first = b.step("billing", "model_call", "first", null, 10, START);
        const second = b.step("billing", "model_call", "second", null, 10, START);
        expect(b.finish().steps.map((step) => step.id)).toEqual([first.id, second.id, late.id]);
    });
});

describe("RunBuilder.finish at the end of the data", () => {
    it("cuts steps after now and keeps a run that crosses now running", () => {
        const b = new RunBuilder(RUN_ID, NOW - SECOND);
        const model = b.model("billing", { durationMs: 5 * SECOND, calls: ["fetch_page"], mark: "entry" });
        b.tool("billing", "fetch_page", {
            args: { url: "https://supplier-portal.example/pay" },
            output: { summary: "page", values: [{ value: IBAN }] },
            mark: "damage",
        });
        const run = b.finish();
        expect(run.status).toBe("running");
        expect(run.steps.map((step) => step.id)).toEqual([model.id]);
        expect(run.steps[0]).toMatchObject({ status: "running", durationMs: SECOND });
        expect(run.marks).toEqual([{ role: "entry", stepId: model.id }]);
        expect(run.rawArgs).toEqual([]);
        expect(run.index).toEqual([]);
        expect(b.rawArgs).toHaveLength(1);
        expect(b.index).toHaveLength(1);
    });

    it("keeps a run waiting for a person waiting, with the wait running up to now", () => {
        const b = new RunBuilder(RUN_ID, NOW - 10 * MINUTE);
        b.model("support", { calls: ["refund_order"] });
        b.tool("support", "refund_order", { args: { order: "ORD-55120" }, approval: { answer: "waiting" } });
        b.jump(NOW + MINUTE);
        b.model("support");
        const run = b.finish();
        expect(run.status).toBe("waiting");
        const waiting = run.steps.filter((step) => step.status === "waiting");
        expect(waiting.map((step) => step.kind)).toEqual(["tool_call", "approval"]);
        for (const step of waiting) expect(step.startedAt + step.durationMs).toBe(NOW);
        expect(run.steps.every((step) => step.startedAt <= NOW)).toBe(true);
    });

    it("leaves out an approval that a person only answers after now", () => {
        const b = new RunBuilder(RUN_ID, NOW - 10 * SECOND);
        const { step: call } = b.tool("support", "refund_order", {
            args: { order: "ORD-55120" },
            approval: { answer: "approve once", by: "dana@acme.com", waitMs: MINUTE },
        });
        const run = b.finish();
        expect(b.approvals).toHaveLength(1);
        expect(run.approvals).toEqual([]);
        expect(run.status).toBe("running");
        const approval = run.steps.find((step) => step.kind === "approval")!;
        expect(approval.status).toBe("running");
        expect(approval.startedAt + approval.durationMs).toBe(NOW);
        expect(run.steps.find((step) => step.id === call.id)!.status).toBe("running");
    });
});

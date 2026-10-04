import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configure } from "../../core/config.ts";
import { takeEvents } from "../../core/recorder.ts";
import { registerGuardedTool } from "../../context/registry.ts";
import { newRun } from "../../context/run.ts";
import { rulesHash } from "../../policy/rules.ts";
import { tempDir, writeJson } from "../../test/files.ts";
import { resetAll } from "../../test/reset.ts";
import { addModelCost, checkModelCall, countModelCall, judgeModelCall, type ModelCall } from "./model-limits.ts";

afterEach(() => {
    resetAll();
});

function modelCall(): ModelCall {
    return { run: newRun(), agent: "billing", stepId: "s1", model: "gpt-5.4-mini" };
}

describe("checkModelCall", () => {
    it("records nothing for a call under the limits", () => {
        expect(checkModelCall(modelCall())).toBeUndefined();
        expect(takeEvents()).toEqual([]);
    });

    it("lets the last step under the limit through", () => {
        configure({ runLimits: { mode: "block", steps: 3 } });
        const call = modelCall();
        call.run.modelCalls = 2;

        expect(checkModelCall(call)).toBeUndefined();
        call.run.modelCalls = 3;
        expect(checkModelCall(call)).toBeDefined();
    });

    it("records a would-block decision in observe mode and lets the call go", () => {
        const call = modelCall();
        call.run.modelCalls = 200;

        expect(checkModelCall(call)).toBeUndefined();
        expect(takeEvents()).toEqual([
            {
                type: "decision",
                runId: call.run.runId,
                stepId: "s1",
                agent: "billing",
                at: expect.any(String),
                tool: "gpt-5.4-mini",
                guard: "limit",
                rule: "max-steps",
                decision: "block",
                mode: "observe",
                enforced: false,
                reason: "limit_reached",
                policy: undefined,
                rules: undefined,
            },
        ]);
    });

    it("records the rules hash on step and cost decisions", () => {
        registerGuardedTool("pay", [{ type: "approval" }]);
        configure({ runLimits: { mode: "block", steps: 1, costUsd: 0.5 } });
        const call = modelCall();
        call.run.modelCalls = 1;
        call.run.costUsd = 0.5;

        checkModelCall(call);

        const hash = rulesHash();
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
        expect(takeEvents().map((event) => "rule" in event && [event.rule, event.rules])).toEqual([
            ["max-steps", hash],
            ["max-cost", hash],
        ]);
    });

    it("returns a refusal in block mode, for steps and cost alike", () => {
        configure({
            runLimits: { mode: "block", steps: 1, costUsd: 0.5 },
            policyFile: writeJson(join(tempDir(), "p.json"), { version: "v3" }),
        });
        const call = modelCall();
        call.run.modelCalls = 1;
        call.run.costUsd = 0.5;

        const refusal = checkModelCall(call);

        expect(refusal).toMatchObject({ guard: "limit", tool: "gpt-5.4-mini", reason: "limit_reached" });
        expect(takeEvents().map((event) => "rule" in event && [event.rule, event.enforced, event.policy])).toEqual([
            ["max-steps", true, "v3"],
            ["max-cost", true, "v3"],
        ]);
    });

    it("judges from the steps and cost it is given", () => {
        configure({ runLimits: { mode: "block", steps: 3, costUsd: 1 } });
        const call = modelCall();

        expect(judgeModelCall(call, 3, 0.99)).toBeUndefined();
        expect(judgeModelCall(call, 4, 0)).toBeDefined();
        expect(judgeModelCall(call, 1, 1)).toBeDefined();
        expect(takeEvents().map((event) => "rule" in event && event.rule)).toEqual(["max-steps", "max-cost"]);
    });

    it("lets a call through just under the cost limit", () => {
        configure({ runLimits: { mode: "block", costUsd: 0.5 } });
        const call = modelCall();
        call.run.costUsd = 0.4999;

        expect(checkModelCall(call)).toBeUndefined();
    });
});

describe("counting", () => {
    it("counts calls and adds the cost of known models", () => {
        const run = newRun();
        const usage = { inputTokens: 1_000_000, cachedTokens: 0, outputTokens: 0 };

        countModelCall(run);
        const added = [
            addModelCost(run, "gpt-5.4-mini", usage),
            addModelCost(run, "my-local-model", usage),
            addModelCost(run, "gpt-5.4-mini", undefined),
        ];

        expect(run.modelCalls).toBe(1);
        expect(run.costUsd).toBe(0.75);
        expect(added).toEqual([0.75, 0, 0]);
    });
});

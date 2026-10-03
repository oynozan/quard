import { parseHashKey } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configure } from "../../core/config.ts";
import { takeEvents } from "../../core/recorder.ts";
import { newRun } from "../../context/run.ts";
import type { ModelCall } from "../../guards/limit/model-limits.ts";
import { markShared } from "../../guards/limit/run-counts.ts";
import { fakeSockets, sentOf, type FakeSocket } from "../../test/fake-socket.ts";
import { resetAll } from "../../test/reset.ts";
import { setActiveControl } from "../../transport/link/active.ts";
import { createControl, type Control } from "../../transport/link/control.ts";
import { addCost, countSharedModelCall } from "./steps.ts";

// 1M fresh input tokens of gpt-5.4-mini cost $0.75
const USAGE = { inputTokens: 1_000_000, cachedTokens: 0, outputTokens: 0 };

let control: Control | undefined;

function linked() {
    const fake = fakeSockets();
    control = createControl({ url: "ws://c", key: "k", hashKey: parseHashKey("ab".repeat(32)), open: fake.open });
    setActiveControl(control);
    return fake;
}

function sharedCall(): ModelCall {
    const run = newRun();
    markShared(run);
    return { run, agent: "billing", stepId: "a".repeat(16), model: "gpt-5.4-mini" };
}

const runCounts = (socket: FakeSocket) =>
    sentOf(socket, "run_count").map(({ counter, add, max }) => ({ counter, add, max }));

function rules() {
    return takeEvents().flatMap((event) => (event.type === "decision" ? [[event.rule, event.mode]] : []));
}

// Answers the step count and the cost read, in the order they were sent
function answer(socket: FakeSocket, steps: { ok: boolean; used: number }, cost: number): void {
    const [step, read] = sentOf(socket, "run_count");
    socket.reply({ type: "counted", id: step?.id as string, ...steps });
    socket.reply({ type: "counted", id: read?.id as string, ok: true, used: cost });
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    control?.stop();
    control = undefined;
    resetAll();
    vi.useRealTimers();
});

describe("countSharedModelCall", () => {
    it("counts the step with the cap and reads the cost when the limits are enforced", async () => {
        configure({ runLimits: { mode: "block", steps: 10 } });
        const socket = linked().connect();
        const call = sharedCall();

        const counted = countSharedModelCall(call);
        answer(socket, { ok: true, used: 4 }, 1.25);

        expect(await counted).toBeUndefined();
        expect(runCounts(socket)).toEqual([
            { counter: "steps", add: 1, max: 10 },
            { counter: "cost", add: 0, max: undefined },
        ]);
        expect([call.run.modelCalls, call.run.costUsd]).toEqual([4, 1.25]);
        expect(rules()).toEqual([]);
    });

    it("refuses a step control refuses, and a cost control says is over", async () => {
        configure({ runLimits: { mode: "block", steps: 10, costUsd: 5 } });
        const socket = linked().connect();
        const call = sharedCall();

        const counted = countSharedModelCall(call);
        answer(socket, { ok: false, used: 10 }, 5);

        expect(await counted).toMatchObject({ guard: "limit", tool: "gpt-5.4-mini", reason: "limit_reached" });
        expect(rules()).toEqual([
            ["max-steps", "block"],
            ["max-cost", "block"],
        ]);
        expect(call.run.modelCalls).toBe(10);
    });

    it("sends no cap in observe mode and records 'would block' from control's totals", async () => {
        configure({ runLimits: { steps: 10 } });
        const socket = linked().connect();
        const call = sharedCall();

        const counted = countSharedModelCall(call);
        answer(socket, { ok: true, used: 11 }, 0);

        expect(await counted).toBeUndefined();
        expect(runCounts(socket)[0]).toEqual({ counter: "steps", add: 1, max: undefined });
        expect(rules()).toEqual([["max-steps", "observe"]]);
    });

    it("refuses at once, counting no step, when this process already knows the cost is over", async () => {
        configure({ runLimits: { mode: "block", costUsd: 1 } });
        const socket = linked().connect();
        const call = sharedCall();
        call.run.costUsd = 1;

        expect(await countSharedModelCall(call)).toBeDefined();
        expect(runCounts(socket)).toEqual([]);
        expect(call.run.modelCalls).toBe(0);
        expect(rules()).toEqual([["max-cost", "block"]]);
    });

    it("counts here while control is away, and sends the steps once it is back", async () => {
        configure({ runLimits: { mode: "block", steps: 1 } });
        const fake = linked();
        const call = sharedCall();

        expect(await countSharedModelCall(call)).toBeUndefined();
        expect(await countSharedModelCall(call)).toBeDefined();

        expect(call.run.modelCalls).toBe(1);
        expect(runCounts(fake.connect())).toEqual([{ counter: "steps", add: 1, max: undefined }]);
    });

    it("counts here without any control", async () => {
        const call = sharedCall();

        expect(await countSharedModelCall(call)).toBeUndefined();
        expect(call.run.modelCalls).toBe(1);
    });
});

describe("addCost", () => {
    it("adds the cost here and sends it to control for a shared run", async () => {
        const socket = linked().connect();
        const { run } = sharedCall();

        addCost(run, "gpt-5.4-mini", USAGE);
        const [sent] = sentOf(socket, "run_count");
        socket.reply({ type: "counted", id: sent?.id as string, ok: true, used: 3.75 });
        await vi.advanceTimersByTimeAsync(0);

        expect(runCounts(socket)).toEqual([{ counter: "cost", add: 0.75, max: undefined }]);
        expect(run.costUsd).toBe(3.75);
    });

    it("sends nothing for a run that is not shared, a call with no known cost, or a broken one", () => {
        const socket = linked().connect();
        const unshared = newRun();
        const { run } = sharedCall();

        addCost(unshared, "gpt-5.4-mini", USAGE);
        addCost(run, "my-local-model", USAGE);
        addCost(run, "gpt-5.4-mini", { ...USAGE, inputTokens: Infinity });

        expect(unshared.costUsd).toBe(0.75);
        expect(runCounts(socket)).toEqual([]);
    });

    it("only adds here without control", () => {
        const { run } = sharedCall();

        addCost(run, "gpt-5.4-mini", USAGE);

        expect(run.costUsd).toBe(0.75);
    });
});

import { tool } from "@openai/agents";
import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ApprovalAnswer } from "../../core/config.ts";
import { quard } from "../../index.ts";
import { decisionsOf } from "../../test/events.ts";
import { scriptedClient, testAgent, toolResults } from "../../test/openai-agents.ts";
import { resetAll } from "../../test/reset.ts";
import { quardRunner } from "./runner.ts";
import { guardedTool } from "./tool.ts";

const PAY = { name: "payInvoice", args: { iban: "DE89370400440532013000", amount: 4950 } };

let events: RunEvent[] = [];
let answer: (value: ApprovalAnswer) => void = () => undefined;

beforeEach(() => {
    events = [];
    // The approver answers only when the test says so
    const approver = () => new Promise<ApprovalAnswer>((resolve) => (answer = resolve));
    quard.configure({ onEvent: (event) => events.push(event), approver });
});

afterEach(() => {
    resetAll();
});

function payTool(timeoutMs?: number) {
    const rawPay = vi.fn(async () => "paid");
    const payInvoice = guardedTool({
        name: "payInvoice",
        description: "Pay",
        parameters: z.object({ iban: z.string(), amount: z.number() }),
        execute: rawPay,
        timeoutMs,
        guard: { type: "approval" },
    });
    return { rawPay, payInvoice };
}

// Lets a late answer reach the guard, if it still waits
async function answerLate(): Promise<void> {
    answer("once");
    await new Promise((resolve) => setTimeout(resolve, 20));
}

function abortedDecisions() {
    return decisionsOf(events).filter((event) => event.guard === "approval" && event.rule === "aborted");
}

describe("a guarded call the SDK gives up on", () => {
    it("never runs the tool after the SDK's tool timeout", async () => {
        const { rawPay, payInvoice } = payTool(50);
        const { client, bodies } = scriptedClient({ billing: [{ calls: [PAY] }, { text: "Timed out." }] });

        const result = await quardRunner({ client }).run(testAgent("billing", { tools: [payInvoice] }), "Pay.");
        await answerLate();

        expect(result.finalOutput).toBe("Timed out.");
        expect(toolResults(bodies[1] as Record<string, unknown>).payInvoice).toContain("timed out");
        expect(rawPay).not.toHaveBeenCalled();
        expect(abortedDecisions()).toEqual([expect.objectContaining({ decision: "block" })]);
    });

    it("never runs the tool after the app aborts the run", async () => {
        const { rawPay, payInvoice } = payTool();
        const { client } = scriptedClient({ billing: [{ calls: [PAY] }] });
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 50);

        const runner = quardRunner({ client });
        const run = runner.run(testAgent("billing", { tools: [payInvoice] }), "Pay.", { signal: controller.signal });
        await expect(run).rejects.toThrow("aborted");
        await answerLate();

        expect(rawPay).not.toHaveBeenCalled();
        expect(abortedDecisions()).toHaveLength(1);
    });

    it("never runs the tool when a sibling call fails in the same step", async () => {
        const { rawPay, payInvoice } = payTool();
        const broken = tool({
            name: "broken",
            description: "Fails",
            parameters: z.object({}),
            errorFunction: null,
            execute: async () => {
                throw new Error("sibling failed");
            },
        });
        const { client } = scriptedClient({ billing: [{ calls: [PAY, { name: "broken", args: {} }] }] });

        const runner = quardRunner({ client });
        const run = runner.run(testAgent("billing", { tools: [payInvoice, broken] }), "Pay.");
        await expect(run).rejects.toThrow("sibling failed");
        await answerLate();

        expect(rawPay).not.toHaveBeenCalled();
    });
});

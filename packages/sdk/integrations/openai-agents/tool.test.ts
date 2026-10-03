import { defineToolOutputGuardrail, RunContext, ToolCallError } from "@openai/agents";
import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GuardBlockedError, GuardRefusal, quard } from "../../index.ts";
import { decisionsOf } from "../../test/events.ts";
import { scriptedClient, testAgent, toolResults } from "../../test/openai-agents.ts";
import { resetAll } from "../../test/reset.ts";
import { quardRunner } from "./runner.ts";
import { guardedTool } from "./tool.ts";

const IBAN = "DE89370400440532013000";
const PAY = { name: "payInvoice", args: { iban: IBAN, amount: 4950 } };

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

const parameters = z.object({ iban: z.string(), amount: z.number() });

// Only IBANs from the supplier records may be paid
const fromSupplier = { type: "action" as const, rules: [{ field: "iban", from: ["tool:getSupplier"] }] };

function billingRun(turns: Array<{ calls?: Array<{ name: string; args: object }>; text?: string }>) {
    const { client, bodies } = scriptedClient({ billing: turns });
    return { runner: quardRunner({ client }), bodies };
}

describe("guardedTool", () => {
    it("blocks a call with a guardrail rejection that the model reads as Quard's refusal", async () => {
        const rawPay = vi.fn(async () => "paid");
        const payInvoice = guardedTool({
            name: "payInvoice",
            description: "Pay",
            parameters,
            execute: rawPay,
            guard: fromSupplier,
        });
        const { runner, bodies } = billingRun([{ calls: [PAY] }, { text: "I could not pay." }]);

        const result = await runner.run(testAgent("billing", { tools: [payInvoice] }), "Pay invoice 114.");

        const refusal = new GuardRefusal({
            guard: "action",
            tool: "payInvoice",
            reason: "value_model_generated",
            field: "iban",
        });
        expect(rawPay).not.toHaveBeenCalled();
        expect(result.finalOutput).toBe("I could not pay.");
        expect(toolResults(bodies[1] as Record<string, unknown>)).toEqual({ payInvoice: refusal.text });
        expect(result.toolOutputGuardrailResults).toEqual([
            {
                guardrail: { type: "tool_output", name: "quard" },
                output: { behavior: { type: "rejectContent", message: refusal.text }, outputInfo: refusal.toJSON() },
            },
        ]);
        expect(decisionsOf(events).find((event) => event.decision === "block")).toMatchObject({
            agent: "billing",
            tool: "payInvoice",
            guard: "action",
        });
    });

    it("runs an allowed call with the run context and the call details", async () => {
        const seen: Array<[unknown, unknown, unknown]> = [];
        const getSupplier = guardedTool({
            name: "getSupplier",
            description: "Look up a supplier",
            parameters: z.object({ supplier: z.string() }),
            execute: async (input, context, details) => {
                seen.push([input, context, details]);
                return `Acme Supplies IBAN: ${IBAN}`;
            },
            guard: [
                { type: "limit", maxCallsPerRun: 5 },
                { type: "source", origin: "tool:getSupplier" },
            ],
        });
        const { runner, bodies } = billingRun([
            { calls: [{ name: "getSupplier", args: { supplier: "acme" } }] },
            { text: "Found it." },
        ]);

        await runner.run(testAgent("billing", { tools: [getSupplier] }), "Find Acme.");

        const [[input, context, details]] = seen as [[unknown, unknown, { toolCall?: { name: string } }]];
        expect(input).toEqual({ supplier: "acme" });
        expect(context).toBeInstanceOf(RunContext);
        expect(details.toolCall?.name).toBe("getSupplier");
        expect(toolResults(bodies[1] as Record<string, unknown>)).toEqual({
            getSupplier: `Acme Supplies IBAN: ${IBAN}`,
        });
        const guards = new Set(decisionsOf(events).map((event) => `${event.tool}:${event.guard}`));
        expect(guards).toEqual(new Set(["getSupplier:permission", "getSupplier:limit", "getSupplier:source"]));
    });

    it("stops the run with GuardBlockedError when the guard throws", async () => {
        const payInvoice = guardedTool({
            name: "payInvoice",
            description: "Pay",
            parameters,
            execute: async () => "paid",
            guard: { ...fromSupplier, onBlock: "throw" },
        });
        const { runner } = billingRun([{ calls: [PAY] }]);

        const error = await runner.run(testAgent("billing", { tools: [payInvoice] }), "Pay.").catch((e: unknown) => e);

        expect(error).toBeInstanceOf(GuardBlockedError);
        expect((error as GuardBlockedError).reason).toBe("value_model_generated");
        expect((error as GuardBlockedError).cause).toBeInstanceOf(ToolCallError);
        expect(events.at(-1)).toMatchObject({ type: "run_finished", status: "blocked" });
    });

    it("leaves errors from the tool itself to the SDK", async () => {
        const payInvoice = guardedTool({
            name: "payInvoice",
            description: "Pay",
            parameters,
            execute: async () => {
                throw new Error("bank is down");
            },
            guard: { type: "limit", maxCallsPerRun: 5 },
        });
        const { runner, bodies } = billingRun([{ calls: [PAY] }, { text: "The bank is down." }]);

        const result = await runner.run(testAgent("billing", { tools: [payInvoice] }), "Pay.");

        expect(result.finalOutput).toBe("The bank is down.");
        expect(toolResults(bodies[1] as Record<string, unknown>).payInvoice).toContain("bank is down");
    });

    it("keeps the tool's own output guardrails after Quard's", async () => {
        const later = vi.fn(async () => ({ behavior: { type: "allow" as const } }));
        const payInvoice = guardedTool({
            name: "payInvoice",
            description: "Pay",
            parameters,
            execute: async () => "paid",
            guard: { type: "limit", maxCallsPerRun: 5 },
            outputGuardrails: [defineToolOutputGuardrail({ name: "later", run: later })],
        });
        const { runner } = billingRun([{ calls: [PAY] }, { text: "Paid." }]);

        const result = await runner.run(testAgent("billing", { tools: [payInvoice] }), "Pay.");

        expect(later).toHaveBeenCalledWith(expect.objectContaining({ output: "paid" }));
        expect(result.toolOutputGuardrailResults.map((item) => item.guardrail.name)).toEqual(["quard", "later"]);
    });
});

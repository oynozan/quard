import { InvalidToolOutputError, ToolCallError } from "@openai/agents";
import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GuardBlockedError, GuardRefusal, quard } from "../../index.ts";
import { scriptedClient, testAgent, toolResults } from "../../test/openai-agents.ts";
import { resetAll } from "../../test/reset.ts";
import { quardRunner } from "./runner.ts";
import { guardedTool } from "./tool.ts";

const IBAN = "DE89370400440532013000";
const PAY = { name: "payInvoice", args: { iban: IBAN, amount: 4950 } };
const parameters = z.object({ iban: z.string(), amount: z.number() });
const outputSchema = z.object({ ok: z.boolean() });

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

function payTool(options: { onBlock?: "throw"; output?: unknown; allow?: boolean } = {}) {
    // A bad output goes past the types, as it can from untyped code
    const rawPay = vi.fn(async () => (options.output ?? { ok: true }) as { ok: boolean });
    const guard = options.allow
        ? { type: "limit" as const, maxCallsPerRun: 5 }
        : { type: "action" as const, rules: [{ field: "iban", from: ["tool:getSupplier"] }], onBlock: options.onBlock };
    const payInvoice = guardedTool({
        name: "payInvoice",
        description: "Pay",
        parameters,
        outputSchema,
        execute: rawPay,
        guard,
    });
    return { rawPay, payInvoice };
}

function billingRun(turns: Array<{ calls?: Array<{ name: string; args: object }>; text?: string }>) {
    const { client, bodies } = scriptedClient({ billing: turns });
    return { runner: quardRunner({ client }), bodies };
}

describe("a guarded tool with an output schema", () => {
    it("gives the model Quard's refusal when a guard blocks", async () => {
        const { rawPay, payInvoice } = payTool();
        const { runner, bodies } = billingRun([{ calls: [PAY] }, { text: "I could not pay." }]);

        const result = await runner.run(testAgent("billing", { tools: [payInvoice] }), "Pay.");

        const refusal = new GuardRefusal({
            guard: "action",
            tool: "payInvoice",
            reason: "value_model_generated",
            field: "iban",
        });
        expect(rawPay).not.toHaveBeenCalled();
        expect(result.finalOutput).toBe("I could not pay.");
        expect(toolResults(bodies[1] as Record<string, unknown>).payInvoice).toBe(JSON.stringify(refusal.text));
        expect(events.at(-1)).toMatchObject({ type: "run_finished", status: "completed" });
    });

    it("stops the run with GuardBlockedError when the guard throws", async () => {
        const { payInvoice } = payTool({ onBlock: "throw" });
        const { runner } = billingRun([{ calls: [PAY] }]);

        const error = await runner.run(testAgent("billing", { tools: [payInvoice] }), "Pay.").catch((e: unknown) => e);

        expect(error).toBeInstanceOf(GuardBlockedError);
        expect(events.at(-1)).toMatchObject({ type: "run_finished", status: "blocked" });
    });

    it("still shows the model the schema and checks real results against it", async () => {
        const { payInvoice } = payTool({ allow: true });
        const { runner, bodies } = billingRun([{ calls: [PAY] }, { text: "Paid." }]);

        await runner.run(testAgent("billing", { tools: [payInvoice] }), "Pay.");

        const [shown] = (bodies[0] as { tools: Array<Record<string, unknown>> }).tools;
        expect(shown?.output_schema).toMatchObject({ type: "object", properties: { ok: { type: "boolean" } } });
        expect(toolResults(bodies[1] as Record<string, unknown>).payInvoice).toBe('{"ok":true}');
    });

    it("fails the run on a real result that does not match the schema", async () => {
        const { payInvoice } = payTool({ allow: true, output: { ok: "yes" } });
        const { runner } = billingRun([{ calls: [PAY] }]);

        const error = await runner.run(testAgent("billing", { tools: [payInvoice] }), "Pay.").catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ToolCallError);
        expect((error as ToolCallError).error).toBeInstanceOf(InvalidToolOutputError);
    });
});

describe("a guarded tool with a JSON output schema", () => {
    it("hands the schema to the SDK as it is, and the model still reads the refusal", async () => {
        const schema = {
            type: "object" as const,
            properties: { ok: { type: "boolean" } },
            required: ["ok"],
            additionalProperties: false as const,
        };
        const payInvoice = guardedTool({
            name: "payInvoice",
            description: "Pay",
            parameters,
            outputSchema: schema,
            execute: async () => ({ ok: true }),
            guard: { type: "action", rules: [{ field: "iban", from: ["tool:getSupplier"] }] },
        });
        const { runner, bodies } = billingRun([{ calls: [PAY] }, { text: "I could not pay." }]);

        await runner.run(testAgent("billing", { tools: [payInvoice] }), "Pay.");

        expect(payInvoice.outputSchema).toBe(schema);
        expect(toolResults(bodies[1] as Record<string, unknown>).payInvoice).toContain("did NOT run");
    });
});

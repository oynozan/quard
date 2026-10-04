import { ToolCallError } from "@openai/agents";
import type { RunEvent } from "@quard/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { GuardBlockedError, quard } from "../../index.ts";
import { scriptedClient, testAgent, toolResults } from "../../test/openai-agents.ts";
import { resetAll } from "../../test/reset.ts";
import { quardRunner } from "./runner.ts";
import { guardedTool } from "./tool.ts";

const PAY = { name: "payInvoice", args: { iban: "DE89370400440532013000", amount: 4950 } };

let events: RunEvent[] = [];

beforeEach(() => {
    events = [];
    quard.configure({ onEvent: (event) => events.push(event) });
});

afterEach(() => {
    resetAll();
});

// A payment tool whose guard stops the run on a block
function throwingPay() {
    return guardedTool({
        name: "payInvoice",
        description: "Pay",
        parameters: z.object({ iban: z.string(), amount: z.number() }),
        execute: async () => "paid",
        guard: { type: "action", rules: [{ field: "iban", from: ["tool:getSupplier"] }], onBlock: "throw" },
    });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
    return promise.then(
        () => undefined,
        (error: unknown) => error,
    );
}

describe("a streamed run whose guard throws", () => {
    it("rejects with GuardBlockedError wherever the app reads it", async () => {
        const { client } = scriptedClient({ billing: [{ calls: [PAY] }] });
        const billing = testAgent("billing", { tools: [throwingPay()] });

        const result = await quardRunner({ client }).run(billing, "Pay.", { stream: true });
        const read = caught(
            (async () => {
                for await (const _event of result) {
                    // Reads the stream to its end
                }
            })(),
        );
        const completed = await caught(result.completed);

        expect(completed).toBeInstanceOf(GuardBlockedError);
        expect((completed as GuardBlockedError).cause).toBeInstanceOf(ToolCallError);
        expect(await read).toBe(completed);
        expect(result.error).toBe(completed);
        await new Promise((resolve) => setImmediate(resolve));
        expect(events.at(-1)).toMatchObject({ type: "run_finished", status: "blocked" });
    });

    it("reaches the calling agent as GuardBlockedError inside an agent run as a tool", async () => {
        const billing = testAgent("billing", { tools: [throwingPay()] });
        const asTool = billing.asTool({ toolName: "billing", toolDescription: "Pay", onStream: () => undefined });
        const orchestrator = testAgent("orchestrator", { tools: [asTool] });
        const { client, bodies } = scriptedClient({
            orchestrator: [{ calls: [{ name: "billing", args: { input: "Pay." } }] }, { text: "Not paid." }],
            billing: [{ calls: [PAY] }],
        });

        await quardRunner({ client }).run(orchestrator, "Pay invoice 114.");

        const read = toolResults(bodies.at(-1) as Record<string, unknown>).billing;
        expect(read).toContain("GuardBlockedError");
        expect(read).not.toContain("ToolCallError");
    });
});

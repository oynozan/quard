import { Agent, RunContext } from "@openai/agents";
import { describe, expect, it } from "vitest";
import { GuardBlockedError, GuardRefusal } from "../../core/refusal.ts";
import { quardGuardrail } from "./guardrail.ts";

const refusal = new GuardRefusal({
    guard: "action",
    tool: "payInvoice",
    reason: "value_not_from_allowed_origin",
    field: "iban",
});

function check(output: unknown) {
    return quardGuardrail.run({
        context: new RunContext(),
        agent: new Agent({ name: "billing" }),
        toolCall: { type: "function_call", callId: "call_1", name: "payInvoice", arguments: "{}" },
        output,
    });
}

describe("quardGuardrail", () => {
    it("turns a refusal into a rejection that carries Quard's own text", async () => {
        expect(await check(refusal)).toEqual({
            behavior: { type: "rejectContent", message: refusal.text },
            outputInfo: refusal.toJSON(),
        });
    });

    it("stops the run when the guard threw", async () => {
        const error = new GuardBlockedError(refusal);

        await expect(check(error)).rejects.toBe(error);
    });

    it("lets any other output through", async () => {
        expect(await check("paid")).toEqual({ behavior: { type: "allow" } });
    });
});

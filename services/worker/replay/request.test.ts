import type { ModelCallRecord } from "@quard/db";
import { describe, expect, it } from "vitest";
import { NO_HISTORY, NOT_RECORDED, rebuildRequest } from "./request.ts";

function call(stepId: string, requestBody: Record<string, unknown> | null, change: Partial<ModelCallRecord> = {}) {
    return { stepId, model: "gpt-5.4-mini", responseId: null, toolCalls: [], requestBody, at: new Date(0), ...change };
}

const first = call(
    "1".repeat(16),
    { model: "gpt-5.4-mini", instructions: "Be brief.", input: "Pay the invoice" },
    {
        responseId: "resp_1",
        toolCalls: [{ callId: "call_1", name: "fetchPage", arguments: '{"url":"https://a.example"}' }],
    },
);
const output = { type: "function_call_output", call_id: "call_1", output: "page" };

describe("rebuildRequest", () => {
    it("returns a request that resends its whole input as recorded", () => {
        const own = call("2".repeat(16), { model: "gpt-5.4-mini", input: [output] });

        expect(rebuildRequest([first, own], own.stepId)).toEqual({ model: "gpt-5.4-mini", input: [output] });
    });

    it("spells out the responses a chained request continued", () => {
        const second = call(
            "2".repeat(16),
            { model: "gpt-5.4-mini", previous_response_id: "resp_1", input: [output] },
            { responseId: "resp_2" },
        );
        const third = call("3".repeat(16), { model: "gpt-5.4-mini", previous_response_id: "resp_2", input: "Done?" });

        expect(rebuildRequest([first, second, third], third.stepId)).toEqual({
            model: "gpt-5.4-mini",
            previous_response_id: "resp_2",
            input: [
                { role: "user", content: "Pay the invoice" },
                {
                    type: "function_call",
                    call_id: "call_1",
                    name: "fetchPage",
                    arguments: '{"url":"https://a.example"}',
                },
                output,
                { role: "user", content: "Done?" },
            ],
        });
    });

    it("reads an input of no known shape as empty", () => {
        const own = call("2".repeat(16), { model: "gpt-5.4-mini", input: 5 });

        expect(rebuildRequest([own], own.stepId)).toMatchObject({ input: [] });
    });

    it.each([
        ["the turning point is no model call", [first], "2".repeat(16)],
        ["its request was not uploaded", [call("2".repeat(16), null)], "2".repeat(16)],
    ])("is limited when %s", (_what, calls, stepId) => {
        expect(rebuildRequest(calls, stepId)).toBe(NOT_RECORDED);
    });

    it.each([
        ["an unknown earlier response", [call("2".repeat(16), { previous_response_id: "resp_9", input: [] })]],
        [
            "an earlier response without its request",
            [{ ...first, requestBody: null }, call("2".repeat(16), { previous_response_id: "resp_1" })],
        ],
        ["a conversation", [call("2".repeat(16), { conversation: "conv_1", input: [] })]],
        [
            "an earlier response in a conversation",
            [
                { ...first, requestBody: { conversation: { id: "conv_1" } } },
                call("2".repeat(16), { previous_response_id: "resp_1" }),
            ],
        ],
        ["a later response", [call("2".repeat(16), { previous_response_id: "resp_1" }), first]],
    ])("is limited by %s", (_what, calls) => {
        expect(rebuildRequest(calls, "2".repeat(16))).toBe(NO_HISTORY);
    });
});

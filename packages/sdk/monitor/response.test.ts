import { describe, expect, it } from "vitest";
import { functionCallOf, functionCallsOf, responseIdOf, usageOf } from "./response.ts";

describe("response helpers", () => {
    it("reads function calls", () => {
        expect(functionCallOf({ type: "function_call", call_id: "c1", name: "pay", arguments: '{"a":1}' })).toEqual({
            callId: "c1",
            name: "pay",
            arguments: '{"a":1}',
        });
        expect(functionCallOf({ type: "function_call", call_id: "c2", name: "pay" })?.arguments).toBe("{}");
        expect(functionCallOf({ type: "message" })).toBeUndefined();
        expect(functionCallOf(null)).toBeUndefined();
    });

    it("lists the function calls in a response", () => {
        const response = {
            output: [{ type: "message" }, { type: "function_call", call_id: "c1", name: "pay", arguments: "{}" }],
        };

        expect(functionCallsOf(response).map((call) => call.callId)).toEqual(["c1"]);
        expect(functionCallsOf({})).toEqual([]);
    });

    it("reads the response id", () => {
        expect(responseIdOf({ id: "resp_1" })).toBe("resp_1");
        expect(responseIdOf({ id: 5 })).toBeUndefined();
        expect(responseIdOf(undefined)).toBeUndefined();
    });

    it("reads token usage, with cached tokens when sent", () => {
        const usage = { input_tokens: 120, output_tokens: 30, input_tokens_details: { cached_tokens: 100 } };

        expect(usageOf({ usage })).toEqual({ inputTokens: 120, cachedTokens: 100, outputTokens: 30 });
        expect(usageOf({ usage: { input_tokens: 5, output_tokens: 1 } })).toEqual({
            inputTokens: 5,
            cachedTokens: 0,
            outputTokens: 1,
        });
    });

    it("finds no usage when the counts are missing or not numbers", () => {
        expect(usageOf({})).toBeUndefined();
        expect(usageOf({ usage: { input_tokens: "5", output_tokens: 1 } })).toBeUndefined();
        expect(usageOf({ usage: { input_tokens: 5 } })).toBeUndefined();
    });
});

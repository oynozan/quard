import { describe, expect, it } from "vitest";
import { functionCallOf, functionCallsOf, responseIdOf } from "./response.ts";

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
});

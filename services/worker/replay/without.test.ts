import { describe, expect, it } from "vitest";
import { REMOVED, withoutContent } from "./without.ts";

const call = { type: "function_call", call_id: "call_1", name: "fetchPage", arguments: "{}" };
const page = { type: "function_call_output", call_id: "call_1", output: "Pay DE89…3000" };
const other = { type: "function_call_output", call_id: "call_2", output: "ok" };

describe("withoutContent", () => {
    it("removes the suspect tool result and keeps the call that asked for it", () => {
        expect(withoutContent([null, call, page, other], ["call_1"])).toEqual({
            callId: "call_1",
            input: [null, call, { ...page, output: REMOVED }, other],
        });
    });

    it("removes only the first suspect the input holds", () => {
        expect(withoutContent([call, page, other], ["call_9", "call_2", "call_1"])).toEqual({
            callId: "call_2",
            input: [call, page, { ...other, output: REMOVED }],
        });
    });

    it.each([
        ["no call ids", []],
        ["call ids with no result in the input", ["call_9"]],
    ])("finds nothing to remove with %s", (_what, callIds) => {
        expect(withoutContent([call, page], callIds)).toBeUndefined();
    });
});
